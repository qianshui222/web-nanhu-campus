package cn.edu.demo.nanhu;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class CampusStore {
    record Snapshot(int revision, Campus scene) {}
    record Item(String owner, String kind, String id, ObjectNode data) {}
    record Revision(int revision, String editor, String publishedAt, String note, Integer restoredFrom) {}
    record Draft(int revision, Campus scene, String token, String savedAt) {}
    record Publication(String token, String note, String feedbackOwner, String feedbackId) {}

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;

    CampusStore(JdbcTemplate db, ObjectMapper json, PlatformTransactionManager manager) {
        this.db = db;
        this.json = json;
        this.transactions = new TransactionTemplate(manager);
    }

    @Bean ApplicationRunner sceneSeed() {
        return args -> {
            Campus initial;
            try (var in = new ClassPathResource("scene.json").getInputStream()) {
                initial = json.readValue(in, Campus.class);
                initial.validate();
            }
            if (db.queryForObject("SELECT COUNT(*) FROM campus_scene", Integer.class) == 0) {
                db.update("INSERT INTO campus_scene VALUES (1, 1, ?)", encode(initial));
            }
            if (db.queryForObject("SELECT COUNT(*) FROM scene_revisions", Integer.class) == 0) {
                archive(snapshot(),"system","启用版本历史时的校园快照",null);
            }
            String migration="campus-blender-assets-2026";
            if (db.queryForObject("SELECT COUNT(*) FROM scene_migrations WHERE migration_id=?",Integer.class,migration)==0) {
                Campus old=template("scene-before-gis.json"), v2=template("scene-v2.json"), v3=template("scene-v3.json"), v4=template("scene-v4.json");
                transactions.executeWithoutResult(status -> {
                    var previous=snapshot();
                    boolean restored=revisions().getFirst().restoredFrom()!=null;
                    if (!restored && (previous.scene().equals(old)||previous.scene().equals(v2)||previous.scene().equals(v3)||previous.scene().equals(v4))) {
                        publish("system",new Snapshot(previous.revision(),initial),"Blender 校园资产与楼间距、食堂接入校正",null);
                    }
                    db.update("INSERT INTO scene_migrations VALUES (?)",migration);
                });
            }
        };
    }

    private Campus template(String path) throws IOException {
        try(var in=new ClassPathResource(path).getInputStream()){return json.readValue(in,Campus.class);}
    }

    Snapshot snapshot() {
        return db.queryForObject("SELECT revision, document FROM campus_scene WHERE id = 1",
            (rs, row) -> new Snapshot(rs.getInt(1), decode(rs.getString(2), Campus.class)));
    }

    synchronized Snapshot replace(String editor, Snapshot input) {
        return transactions.execute(status -> publish(editor, input, "从场景编辑接口发布", null));
    }

    List<Revision> revisions() {
        return db.query("SELECT revision, editor, published_at, note, restored_from FROM scene_revisions ORDER BY revision DESC",
            (rs, row) -> new Revision(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getObject(5,Integer.class)));
    }

    Optional<Draft> draft(String owner) {
        return db.query("SELECT base_revision, document, draft_token, saved_at FROM scene_drafts WHERE owner_name = ?",
            (rs, row) -> new Draft(rs.getInt(1), decode(rs.getString(2), Campus.class), rs.getString(3), rs.getString(4)), owner)
            .stream().findFirst();
    }

    synchronized Draft saveDraft(String owner, Draft input) {
        Problem.require(input.scene() != null, "缺少场景数据");
        if (snapshot().revision() != input.revision()) throw new Problem(409, "当前版本已更新，请先重新加载已发布数据");
        var previous = draft(owner);
        if (!Objects.equals(previous.map(Draft::token).orElse(null), input.token())) {
            throw new Problem(409,"草稿已变化，请重新加载");
        }
        String document = encode(input.scene());
        Problem.require(document.length() <= 2_000_000, "草稿过大");
        var saved = new Draft(input.revision(), input.scene(), UUID.randomUUID().toString(), Instant.now().toString());
        if (previous.isPresent()) {
            db.update("UPDATE scene_drafts SET base_revision=?, document=?, draft_token=?, saved_at=? WHERE owner_name=?",
                saved.revision(), document, saved.token(), saved.savedAt(), owner);
        } else {
            db.update("INSERT INTO scene_drafts VALUES (?, ?, ?, ?, ?)", owner,saved.revision(),document,saved.token(),saved.savedAt());
        }
        return saved;
    }

    synchronized void discardDraft(String owner, String token) {
        if (db.update("DELETE FROM scene_drafts WHERE owner_name = ? AND draft_token = ?",owner,token) == 0) {
            throw new Problem(409,"草稿已变化，请重新加载");
        }
    }

    synchronized Snapshot publishDraft(String owner, Publication input) {
        return transactions.execute(status -> {
            var saved = draft(owner).orElseThrow(() -> new Problem(404,"草稿不存在"));
            if (!saved.token().equals(input.token())) throw new Problem(409,"草稿已变化，请重新加载");
            String note = Campus.text(input.note(),500,"发布说明");
            Snapshot result = publish(owner,new Snapshot(saved.revision(),saved.scene()),note,null);
            if (input.feedbackId() != null && !input.feedbackId().isBlank()) {
                var item = find(input.feedbackOwner(),"feedback",input.feedbackId())
                    .orElseThrow(() -> new Problem(404,"关联反馈不存在"));
                item.data().put("publishedRevision",result.revision());
                save(item.owner(),item.kind(),item.id(),item.data());
            }
            discardDraft(owner,saved.token());
            return result;
        });
    }

    synchronized Snapshot restore(String owner, int target, int base) {
        return transactions.execute(status -> {
            Campus scene = db.query("SELECT document FROM scene_revisions WHERE revision=?",
                (rs, row) -> decode(rs.getString(1),Campus.class),target).stream().findFirst()
                .orElseThrow(() -> new Problem(404,"历史版本不存在"));
            return publish(owner,new Snapshot(base,scene),"恢复版本 v"+target,target);
        });
    }

    private void archive(Snapshot snapshot, String editor, String note, Integer restoredFrom) {
        db.update("INSERT INTO scene_revisions VALUES (?,?,?,?,?,?)", snapshot.revision(), encode(snapshot.scene()),
            editor, Instant.now().toString(), note, restoredFrom);
    }

    private Snapshot publish(String editor, Snapshot input, String note, Integer restoredFrom) {
        Problem.require(input.scene() != null, "缺少场景数据");
        Campus scene = input.scene();
        scene.validate();
        Snapshot previous = snapshot();
        if (input.revision() != previous.revision()) throw new Problem(409, "场景已更新，请重新加载后再编辑");
        var places = scene.placeIndex();
        var edges = scene.edgeIndex();
        var tours = scene.tourIndex();
        var oldTours = previous.scene().tourIndex();
        for (Item item : documents("SELECT * FROM personal_items")) {
            var data = item.data();
            switch (item.kind()) {
                case "favorite", "schedule" -> referenced(places, data.path("place").asText());
                case "route" -> {
                    referenced(places, data.path("start").asText());
                    referenced(places, data.path("end").asText());
                    data.path("via").forEach(id -> referenced(places, id.asText()));
                }
                case "itinerary" -> data.path("stops").forEach(id -> referenced(places, id.asText()));
                case "progress" -> {
                    referenced(tours, item.id());
                    int done = data.path("completed").asInt();
                    var before = oldTours.get(item.id()).stops();
                    var after = tours.get(item.id()).stops();
                    Problem.require(after.size() >= done, "导览站点数量少于已有进度");
                    for (int i=0; i<done; i++) {
                        Problem.require(before.get(i).place().equals(after.get(i).place()), "已完成的站点不能改序；请新建导览");
                    }
                }
                case "feedback" -> {
                    String target = data.path("target").asText();
                    if (data.path("type").asText().equals("place")) referenced(places, target);
                    if (data.path("type").asText().equals("road")) referenced(edges, target);
                }
                default -> throw new IllegalStateException("Unsupported item kind");
            }
        }
        int count = db.update("UPDATE campus_scene SET revision = revision + 1, document = ? WHERE id = 1 AND revision = ?",
            encode(scene), input.revision());
        if (count != 1) throw new Problem(409, "场景已更新，请重新加载");
        Snapshot result = new Snapshot(input.revision()+1, scene);
        archive(result,editor,note,restoredFrom);
        return result;
    }

    private void referenced(Map<String, ?> map, String id) {
        Problem.require(map.containsKey(id), "对象 " + id + " 已有关联业务记录，无法删除");
    }

    List<Item> list(String owner, String kind) {
        return documents("SELECT * FROM personal_items WHERE owner_name = ? AND kind = ? ORDER BY item_id", owner, kind);
    }

    List<Item> feedback() {
        return documents("SELECT * FROM personal_items WHERE kind = 'feedback' ORDER BY item_id");
    }

    private List<Item> documents(String sql, Object... args) {
        return db.query(sql, (rs, row) -> new Item(rs.getString("owner_name"), rs.getString("kind"),
            rs.getString("item_id"), decode(rs.getString("document"), ObjectNode.class)), args);
    }

    Optional<Item> find(String owner, String kind, String id) {
        return documents("SELECT * FROM personal_items WHERE owner_name = ? AND kind = ? AND item_id = ?",
            owner, kind, id).stream().findFirst();
    }

    void save(String owner, String kind, String id, ObjectNode data) {
        String document = encode(data);
        if (find(owner, kind, id).isPresent()) {
            db.update("UPDATE personal_items SET document = ? WHERE owner_name = ? AND kind = ? AND item_id = ?",
                document, owner, kind, id);
        } else {
            db.update("INSERT INTO personal_items VALUES (?, ?, ?, ?)", owner, kind, id, document);
        }
    }

    void delete(String owner, String kind, String id) {
        if (db.update("DELETE FROM personal_items WHERE owner_name = ? AND kind = ? AND item_id = ?", owner, kind, id) == 0) {
            throw new Problem(404, "记录不存在");
        }
    }

    private String encode(Object data) {
        try { return json.writeValueAsString(data); }
        catch (JsonProcessingException ex) { throw new IllegalStateException(ex); }
    }

    private <T> T decode(String text, Class<T> type) {
        try { return json.readValue(text, type); }
        catch (IOException ex) { throw new IllegalStateException(ex); }
    }
}

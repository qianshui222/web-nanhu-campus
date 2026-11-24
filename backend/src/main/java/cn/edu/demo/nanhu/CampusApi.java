package cn.edu.demo.nanhu;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.security.Principal;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class CampusApi {
    private static final Set<String> KINDS = Set.of("favorite", "route", "schedule", "progress", "feedback", "itinerary");
    private final CampusStore store;
    private final ObjectMapper json;

    CampusApi(CampusStore store, ObjectMapper json) {
        this.store = store;
        this.json = json;
    }

    @GetMapping("/scene") CampusStore.Snapshot scene() { return store.snapshot(); }

    @PostMapping("/route") Campus.Route route(@RequestBody Campus.RouteRequest request) {
        return store.snapshot().scene().route(request);
    }

    @PostMapping("/route/compare") Routing.Comparison compare(@RequestBody Campus.RouteRequest request) {
        var snapshot=store.snapshot();
        return new Routing(snapshot.scene(),request.avoidStairs()).compare(snapshot.revision(),Routing.requestedStops(request));
    }

    @PostMapping("/itinerary/plan") Routing.Plan itinerary(@RequestBody Routing.PlanRequest request) {
        var snapshot=store.snapshot();
        return new Routing(snapshot.scene(),request.avoidStairs()).itinerary(snapshot.revision(),request);
    }

    @PutMapping("/admin/scene") CampusStore.Snapshot replace(Principal user, @RequestBody CampusStore.Snapshot request) {
        return store.replace(user.getName(),request);
    }

    @GetMapping("/admin/scene/history") List<CampusStore.Revision> history() { return store.revisions(); }

    @GetMapping("/admin/scene/draft") Map<String,Object> draft(Principal user) {
        return store.draft(user.getName()).<Map<String,Object>>map(value -> Map.of("draft",value)).orElseGet(Map::of);
    }

    @PutMapping("/admin/scene/draft") CampusStore.Draft saveDraft(Principal user, @RequestBody CampusStore.Draft draft) {
        return store.saveDraft(user.getName(),draft);
    }

    @DeleteMapping("/admin/scene/draft/{token}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void discardDraft(Principal user, @PathVariable String token) { store.discardDraft(user.getName(),token); }

    @PostMapping("/admin/scene/publish") CampusStore.Snapshot publish(Principal user, @RequestBody CampusStore.Publication input) {
        return store.publishDraft(user.getName(),input);
    }

    record Restore(int revision, int target) {}

    @PostMapping("/admin/scene/restore") CampusStore.Snapshot restore(Principal user, @RequestBody Restore input) {
        return store.restore(user.getName(),input.target(),input.revision());
    }

    @GetMapping("/me/{kind}") List<CampusStore.Item> list(Principal principal, @PathVariable String kind) {
        kind(kind);
        return store.list(principal.getName(), kind);
    }

    @PostMapping("/me/{kind}") CampusStore.Item create(Principal user, @PathVariable String kind, @RequestBody ObjectNode input) {
        return write(user.getName(), kind, null, input);
    }

    @PutMapping("/me/{kind}/{id}") CampusStore.Item edit(Principal user, @PathVariable String kind, @PathVariable String id,
                                                        @RequestBody ObjectNode input) {
        return write(user.getName(), kind, id, input);
    }

    @DeleteMapping("/me/{kind}/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(Principal user, @PathVariable String kind, @PathVariable String id) {
        kind(kind);
        Problem.require(Set.of("favorite", "route", "schedule", "itinerary").contains(kind), "此记录不能删除");
        synchronized (store) { store.delete(user.getName(), kind, id); }
    }

    @GetMapping("/admin/feedback") List<CampusStore.Item> allFeedback() { return store.feedback(); }

    @PutMapping("/admin/feedback/{owner}/{id}") CampusStore.Item reply(@PathVariable String owner, @PathVariable String id,
                                                                       @RequestBody ObjectNode body) {
        synchronized (store) {
            var previous = store.find(owner, "feedback", id).orElseThrow(() -> new Problem(404, "反馈不存在"));
            String status = field(body, "status", 20);
            Problem.require(Set.of("pending", "working", "resolved").contains(status), "请选择有效状态");
            ObjectNode data = previous.data();
            data.put("status", status);
            data.put("reply", field(body, "reply", 1000));
            data.put("updatedAt", Instant.now().toString());
            store.save(owner, "feedback", id, data);
            return previous;
        }
    }

    private CampusStore.Item write(String owner, String kind, String id, ObjectNode input) {
        kind(kind);
        synchronized (store) {
            if (id != null && store.find(owner, kind, id).isEmpty()) throw new Problem(404, "记录不存在");
            var scene = store.snapshot().scene();
            var data = json.createObjectNode();
            String key = id == null ? UUID.randomUUID().toString() : id;
            switch (kind) {
                case "favorite" -> {
                    Problem.require(id == null, "请重新收藏此地点");
                    key = place(scene, input, "place");
                    data.put("place", key);
                }
                case "route" -> {
                    var request = json.convertValue(input, Campus.RouteRequest.class);
                    scene.route(request);
                    data.put("name", field(input, "name", 80));
                    data.put("start", request.start());
                    data.put("end", request.end());
                    data.set("via", json.valueToTree(request.via() == null ? List.of() : request.via()));
                    data.put("avoidStairs", request.avoidStairs());
                }
                case "itinerary" -> {
                    var request = json.convertValue(input,Routing.PlanRequest.class);
                    var result = new Routing(scene,request.avoidStairs()).itinerary(store.snapshot().revision(),request);
                    data.put("name",field(input,"name",80));
                    data.set("stops",json.valueToTree(request.stops()));
                    data.put("avoidStairs",request.avoidStairs());
                    data.put("optimize",request.optimize());
                    data.set("lastOrder",json.valueToTree(result.after()));
                    data.put("lastDistance",result.afterDistance());
                    data.put("sceneRevision",result.revision());
                }
                case "schedule" -> {
                    data.put("name", field(input, "name", 100));
                    data.put("place", place(scene, input, "place"));
                    schedule(owner, id, input, data);
                }
                case "progress" -> {
                    Problem.require(id == null, "请使用逐站完成操作");
                    key = field(input, "tour", 64);
                    var tour = scene.tourIndex().get(key);
                    Problem.require(tour != null, "导览不存在");
                    int completed = store.find(owner, kind, key).map(item -> item.data().path("completed").asInt()).orElse(0);
                    if (completed >= tour.stops().size() || !input.path("index").isIntegralNumber() || input.path("index").asInt() != completed) {
                        throw new Problem(409, "导览进度已变化，请刷新");
                    }
                    data.put("completed", completed+1);
                }
                case "feedback" -> {
                    Problem.require(id == null, "已提交反馈无法编辑");
                    data.put("description", field(input, "description", 1000));
                    String type = field(input, "type", 16);
                    switch (type) {
                        case "place" -> data.put("target", place(scene, input, "target"));
                        case "road" -> {
                            String target = field(input, "target", 64);
                            Problem.require(scene.edgeIndex().containsKey(target), "道路不存在");
                            data.put("target", target);
                        }
                        case "position" -> {
                            for (String axis : List.of("x", "z")) {
                                var n = input.path(axis);
                                Problem.require(n.isNumber() && Math.abs(n.asDouble()) <= 175, "请选择有效的地图位置");
                                data.put(axis, n.asDouble());
                            }
                        }
                        default -> throw new Problem(400, "反馈类型无效");
                    }
                    data.put("type", type);
                    data.put("status", "pending");
                    data.put("createdAt", Instant.now().toString());
                    data.put("reportedRevision",store.snapshot().revision());
                }
            }
            store.save(owner, kind, key, data);
            return new CampusStore.Item(owner, kind, key, data);
        }
    }

    private void schedule(String owner, String id, ObjectNode input, ObjectNode data) {
        try {
            String date = input.path("date").asText("");
            int day = input.path("day").asInt(0);
            Problem.require(date.isBlank() ? day >= 1 && day <= 7 : day == 0, "请选择日期或每周重复日期");
            if (!date.isBlank()) LocalDate.parse(date);
            String start = field(input, "start", 5), end = field(input, "end", 5);
            Problem.require(start.matches("[0-9]{2}:[0-9]{2}") && end.matches("[0-9]{2}:[0-9]{2}"), "时间格式须为时:分");
            Problem.require(LocalTime.parse(start).isBefore(LocalTime.parse(end)), "结束时间必须晚于开始时间");
            for (var item : store.list(owner, "schedule")) {
                if (item.id().equals(id)) continue;
                var other = item.data();
                String otherDate = other.path("date").asText("");
                int otherDay = other.path("day").asInt();
                boolean sameDay = date.isBlank()
                    ? otherDate.isBlank() ? day == otherDay : day == LocalDate.parse(otherDate).getDayOfWeek().getValue()
                    : otherDate.isBlank() ? LocalDate.parse(date).getDayOfWeek().getValue() == otherDay : date.equals(otherDate);
                if (sameDay && start.compareTo(other.path("end").asText()) < 0 && end.compareTo(other.path("start").asText()) > 0) {
                    throw new Problem(409, "与「" + other.path("name").asText() + "」时间重叠");
                }
            }
            data.put("date", date);
            data.put("day", day);
            data.put("start", start);
            data.put("end", end);
        } catch (DateTimeParseException ex) { throw new Problem(400, "日期或时间格式无效"); }
    }

    private static void kind(String kind) { Problem.require(KINDS.contains(kind), "记录类型无效"); }

    private static String field(ObjectNode input, String name, int max) {
        JsonNode value = input.path(name);
        return Campus.text(value.isTextual() ? value.textValue().trim() : null, max, name);
    }

    private static String place(Campus scene, ObjectNode input, String key) {
        String id = field(input, key, 64);
        Problem.require(scene.placeIndex().containsKey(id), "地点不存在");
        return id;
    }
}

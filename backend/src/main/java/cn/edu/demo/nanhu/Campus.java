package cn.edu.demo.nanhu;

import java.net.URI;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

record Campus(int version, List<Place> places, List<Node> nodes, List<Edge> edges, List<Tour> tours, List<Shore> water,
              Calibration calibration, List<Shore> boundary) {
    record Place(String id, String name, String type, double x, double z, double w, double d, double h,
                 int floors, String color, String entry, String description, String style, double angle,
                 String service, String updated, String photo, String parent, String openingHours, Asset asset) {}
    record Asset(String model, String source, String status, String facade, Double doorOffset, String variant) {}
    record Node(String id, double x, double z) {}
    record Shore(double x, double z) {}
    record RoadPoint(double x, double z) {
        double distanceTo(RoadPoint other) { return Math.hypot(x-other.x, z-other.z); }
    }
    record Edge(String id, String a, String b, boolean open, boolean stairs, Boolean covered,
                List<RoadPoint> geometry, Double width, Boolean walkable, String evidence) {
        boolean isWalkable() { return !Boolean.FALSE.equals(walkable); }
        List<RoadPoint> shape(Map<String,Node> nodes) {
            var start = nodes.get(a);
            var end = nodes.get(b);
            return geometry == null
                ? List.of(new RoadPoint(start.x(),start.z()), new RoadPoint(end.x(),end.z()))
                : geometry;
        }
    }
    record Tour(String id, String name, String description, List<Stop> stops) {}
    record Stop(String place, String note) {}
    record RouteRequest(String start, String end, List<String> via, boolean avoidStairs) {}
    record Route(List<Node> points, List<String> edges, List<RoadPoint> polyline,
                 double meters, int seconds, double walkingSpeed, boolean estimated) {}
    record Calibration(double metersPerUnit, String source) {}

    Map<String, Place> placeIndex() { return index(places, Place::id, "地点"); }
    Map<String, Node> nodeIndex() { return index(nodes, Node::id, "节点"); }
    Map<String, Edge> edgeIndex() { return index(edges, Edge::id, "道路"); }
    Map<String, Tour> tourIndex() { return index(tours, Tour::id, "主题"); }

    static String text(String s, int max, String label) {
        Problem.require(s != null && !s.isBlank() && s.length() <= max, label + "不能为空，最多 " + max + " 字");
        return s;
    }

    private static <T> Map<String, T> index(List<T> list, Function<T, String> id, String label) {
        Problem.require(list != null && list.size() <= 2000, label + "列表无效");
        var map = new LinkedHashMap<String, T>();
        for (T item : list) {
            Problem.require(item != null, label + "不能为空");
            String key = id.apply(item);
            Problem.require(key != null && key.matches("[A-Za-z0-9_-]{1,64}") && map.putIfAbsent(key, item) == null,
                label + "编号无效或重复");
        }
        return map;
    }

    void validate() {
        Problem.require(version == 1, "场景版本不受支持");
        if (calibration != null) {
            Problem.require(calibration.metersPerUnit() >= .1 && calibration.metersPerUnit() <= 10, "地图比例无效");
            text(calibration.source(), 500, "地图比例说明");
        }
        var pi = placeIndex();
        var ni = nodeIndex();
        var ei = edgeIndex();
        var ti = tourIndex();
        var pairs = new HashSet<Set<String>>();
        Problem.require(!pi.isEmpty(), "场景至少应有一个地点");
        validatePolygon(water,"水岸");
        validatePolygon(boundary,"校区边界");
        for (Node n : ni.values()) coordinate(n.x(), n.z());
        for (Place p : pi.values()) {
            coordinate(p.x(), p.z());
            text(p.name(), 80, "地点名");
            text(p.description(), 1000, "简介");
            text(p.service(), 300, "服务信息");
            text(p.updated(), 150, "更新说明");
            if(p.openingHours()!=null&&!p.openingHours().isBlank()) CampusPlanner.checkHours(p.openingHours());
            Problem.require(p.type() != null && Set.of("teaching", "library", "food", "housing", "sports", "service").contains(p.type()),
                "地点分类无效 " + p.id());
            Problem.require(p.style() != null && Set.of("complex", "annex", "block", "canteen", "dorm", "hall", "court", "track", "service").contains(p.style()),
                "建模类型无效 " + p.id());
            Problem.require(p.w() >= 0 && p.w() <= 250 && p.d() >= 0 && p.d() <= 200 && p.h() >= 0 && p.h() <= 120 &&
                p.floors() >= 1 && p.floors() <= 30 && Math.abs(p.angle()) <= 360 &&
                p.color() != null && p.color().matches("#[0-9a-fA-F]{6}"), "建筑尺寸、角度或颜色无效 " + p.id());
            Problem.require(p.h() == 0 || p.w() >= 2 && p.d() >= 2, "楼体宽度和进深须至少 2 米");
            if (p.asset()!=null) {
                var asset=p.asset();
                Problem.require(p.h()>0 && asset.model()!=null &&
                    asset.model().matches("/assets/campus/v[1-9][0-9]*/"+p.id()+"\\.glb"),"楼体资源路径无效 " + p.id());
                text(asset.source(),80,"楼体来源");
                Problem.require(asset.status()!=null &&
                    Set.of("photo-and-gis","gis-interpretation","stylized-estimate").contains(asset.status()),"楼体核实状态无效");
                Problem.require(asset.facade()==null ||
                    Set.of("north","south","east","west").contains(asset.facade()),"主立面方向无效");
                if (asset.doorOffset()!=null) {
                    double span="east".equals(asset.facade())||"west".equals(asset.facade())?p.d():p.w();
                    Problem.require(Math.abs(asset.doorOffset())<span/2,"门洞偏移超出立面范围");
                }
                Problem.require(asset.variant()==null ||
                    Set.of("brick","banded","concrete").contains(asset.variant()),"楼体立面模板无效");
            }
            Node entry = ni.get(p.entry());
            Problem.require(entry != null, "缺少有效入口 " + p.id());
            double[] local = local(p, entry.x(), entry.z());
            Problem.require(Math.abs(local[0]) <= p.w()/2 + 14 && Math.abs(local[1]) <= p.d()/2 + 14,
                "入口离地点太远 " + p.id() + "，请同步移动入口节点");
            if (p.parent() != null && !p.parent().isBlank()) {
                Place parent = pi.get(p.parent());
                Problem.require(parent != null && parent.h() > 0 && (p.h() == 0 || "annex".equals(p.style())) &&
                    (parent.parent() == null || parent.parent().isBlank()), "附属地点须关联实体主楼 " + p.id());
                double[] near = p.h() == 0 ? local(parent, entry.x(), entry.z()) : local(parent,p.x(),p.z());
                double reachX = p.h() == 0 ? 12 : p.w()/2+6;
                double reachZ = p.h() == 0 ? 12 : p.d()/2+6;
                Problem.require(Math.abs(near[0]) <= parent.w()/2+reachX && Math.abs(near[1]) <= parent.d()/2+reachZ,
                    "请同步更新主楼的附属入口 " + p.id());
            }
            if (p.photo() != null && !p.photo().isBlank()) {
                Problem.require(p.photo().length() <= 700 && p.photo().matches("https://[^\\s]+"), "照片需使用 HTTPS 地址");
                try { Problem.require(URI.create(p.photo()).getHost() != null, "照片地址无效"); }
                catch (IllegalArgumentException ex) { throw new Problem(400, "照片地址无效"); }
            }
        }
        record Segment(String road, Node start, Node end, boolean hasGeometry) {}
        var segments = new ArrayList<Segment>();
        for (Edge e : ei.values()) {
            Node a = ni.get(e.a());
            Node b = ni.get(e.b());
            Problem.require(a != null && b != null && !a.id().equals(b.id()) && distance(a,b) > 0.05,
                "道路端点无效 " + e.id());
            Problem.require(pairs.add(Set.of(e.a(), e.b())), "重复道路 " + e.id());
            if (e.width()!=null) Problem.require(e.width()>=.5 && e.width()<=12,"道路宽度无效 " + e.id());
            if (e.evidence()!=null) text(e.evidence(),300,"道路依据");
            if (!e.isWalkable()) {
                Problem.require(!e.open(),"待核实道路不能开放 " + e.id());
                continue;
            }
            var shape=e.shape(ni);
            Problem.require(shape.size()>=2 && shape.size()<=80 && shape.stream().allMatch(Objects::nonNull),
                "道路折点数量或坐标无效 " + e.id());
            Problem.require(shape.getFirst().distanceTo(new RoadPoint(a.x(),a.z()))<1e-7 &&
                shape.getLast().distanceTo(new RoadPoint(b.x(),b.z()))<1e-7,"折线端点与路口不一致 " + e.id());
            for (int i=1;i<shape.size();i++) {
                var from=shape.get(i-1);
                var to=shape.get(i);
                coordinate(to.x(),to.z());
                Problem.require(from.distanceTo(to)>.02,"道路包含重复折点 " + e.id());
                var start=i==1?a:new Node("",from.x(),from.z());
                var end=i==shape.size()-1?b:new Node("",to.x(),to.z());
                Problem.require(!crossesWater(start,end) && (e.geometry()==null || !crossesWater(end,start)),"道路 " + e.id() + " 穿过水面");
                for (Place p : places)
                    Problem.require(!hits(p,start,end),"道路 " + e.id() + " 穿过 " + p.name());
                segments.add(new Segment(e.id(),start,end,e.geometry()!=null));
            }
        }
        if (calibration != null) {
            for (int i=0;i<segments.size();i++) {
                var first=segments.get(i);
                for (int j=i+1;j<segments.size();j++) {
                    var second=segments.get(j);
                    Node a=first.start(), b=first.end(), c=second.start(), d=second.end();
                    boolean crosses=side(a,b,c)*side(a,b,d)<-1e-8 && side(c,d,a)*side(c,d,b)<-1e-8;
                    boolean detailed=first.hasGeometry() || second.hasGeometry();
                    boolean unsplit=detailed && (insideSegment(a,b,c)||insideSegment(a,b,d)||insideSegment(c,d,a)||insideSegment(c,d,b));
                    boolean mismatchedEnd=detailed && (unlinkedEnds(a,c)||unlinkedEnds(a,d)||unlinkedEnds(b,c)||unlinkedEnds(b,d));
                    Problem.require(!crosses && !unsplit && (first.road().equals(second.road()) || !mismatchedEnd),
                        "道路 " + first.road() + " 与 " + second.road() + " 相交或相接，需核对并拆分真正的路口");
                }
            }
        }
        for (Place p : places) {
            Node entry = ni.get(p.entry());
            Problem.require(edges.stream().anyMatch(e -> e.a().equals(entry.id()) || e.b().equals(entry.id())),
                "入口需要至少一条道路 " + p.id());
        }
        for (Tour tour : ti.values()) {
            text(tour.name(), 80, "导览名称");
            text(tour.description(), 600, "导览说明");
            Problem.require(tour.stops() != null && !tour.stops().isEmpty() && tour.stops().size() <= 40, "站点数量无效");
            for (Stop stop : tour.stops()) {
                Problem.require(stop != null && pi.containsKey(stop.place()), "导览站点不存在");
                text(stop.note(), 500, "站点介绍");
            }
        }
    }

    private static void coordinate(double x, double z) {
        Problem.require(Math.abs(x) <= 175 && Math.abs(z) <= 175, "坐标超出校园编辑范围");
    }

    private static void validatePolygon(List<Shore> polygon, String label) {
        if (polygon == null || polygon.isEmpty()) return;
        Problem.require(polygon.size() >= 3 && polygon.size() <= 80,label+"轮廓点数量无效");
        for (Shore point : polygon) {
            Problem.require(point != null,label+"轮廓点不能为空");
            coordinate(point.x(),point.z());
        }
    }

    private boolean crossesWater(Node a, Node b) {
        if (water == null || water.isEmpty()) return false;
        var start = new Shore(a.x(), a.z());
        var end = new Shore(b.x(), b.z());
        boolean inside = false;
        for (int i=0; i<water.size(); i++) {
            Shore p = water.get(i), q = water.get((i+1)%water.size());
            if ((p.z() > a.z()) != (q.z() > a.z()) &&
                    a.x() < p.x() + (q.x()-p.x())*(a.z()-p.z())/(q.z()-p.z())) inside = !inside;
            if (orientation(start, end, p)*orientation(start, end, q) < 0 &&
                    orientation(p, q, start)*orientation(p, q, end) < 0) return true;
        }
        return inside;
    }

    private static double orientation(Shore a, Shore b, Shore c) {
        return (b.x()-a.x())*(c.z()-a.z()) - (b.z()-a.z())*(c.x()-a.x());
    }
    private static boolean insideSegment(Node a, Node b, Node at) {
        double dx=b.x()-a.x(), dz=b.z()-a.z(), length=distance(a,b);
        double position=((at.x()-a.x())*dx+(at.z()-a.z())*dz)/length;
        return position>.03 && position<length-.03 && Math.abs(side(a,b,at))/length<.005;
    }

    private static boolean unlinkedEnds(Node a, Node b) {
        return distance(a,b)<.005 && (a.id().isEmpty() || !a.id().equals(b.id()));
    }

    private static double side(Node a, Node b, Node c) {
        return (b.x()-a.x())*(c.z()-a.z())-(b.z()-a.z())*(c.x()-a.x());
    }

    private static double[] local(Place p, double x, double z) {
        double t = Math.toRadians(p.angle());
        double dx = x - p.x(), dz = z - p.z();
        return new double[]{Math.cos(t)*dx - Math.sin(t)*dz, Math.sin(t)*dx + Math.cos(t)*dz};
    }

    private static boolean hits(Place p, Node a, Node b) {
        if (p.h() <= 0) return false;
        double[] start = local(p, a.x(), a.z()), end = local(p, b.x(), b.z());
        double[] half = {p.w()/2, p.d()/2};
        double lo = 0, hi = 1;
        for (int i=0; i<2; i++) {
            double delta = end[i] - start[i];
            if (Math.abs(delta) < 1e-8) {
                if (Math.abs(start[i]) >= half[i]) return false;
                continue;
            }
            double f = (-half[i] - start[i])/delta, g = (half[i] - start[i])/delta;
            lo = Math.max(lo, Math.min(f,g));
            hi = Math.min(hi, Math.max(f,g));
            if (hi - lo < 1e-8) return false;
        }
        return true;
    }

    private static double distance(Node a, Node b) { return Math.hypot(a.x()-b.x(), a.z()-b.z()); }

    Route route(RouteRequest request) {
        return new Routing(this, request.avoidStairs()).route(Routing.requestedStops(request));
    }
}

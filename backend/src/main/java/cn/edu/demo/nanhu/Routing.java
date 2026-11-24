package cn.edu.demo.nanhu;

import java.util.*;

final class Routing {
    static final int EXACT_LIMIT = 10;
    private static final double SPEED = 1.25;

    record Metrics(int expanded, long nanos, double distance, int legs) {}
    record Comparison(int revision, Campus.Route route, Metrics dijkstra, Metrics astar) {}
    record PlanRequest(List<String> stops, boolean avoidStairs, boolean optimize) {}
    record Plan(int revision, String method, List<String> before, List<String> after,
                double beforeDistance, double afterDistance, Comparison result) {}
    private record Arc(String to, String edge, double length, double weight) {}
    private record Visit(String node, double cost, double priority) {}
    private record Search(List<String> nodes, List<String> edges, double distance, int expanded) {}
    private record Run(Campus.Route route, Metrics metrics) {}

    private final Map<String, Campus.Place> places;
    private final Map<String, Campus.Node> nodes;
    private final Map<String, Campus.Edge> roads;
    private final Map<String, List<Arc>> graph = new HashMap<>();
    private final double metersPerUnit;

    Routing(Campus campus, boolean avoidStairs) {
        this(campus,avoidStairs,false);
    }

    Routing(Campus campus, boolean avoidStairs, boolean preferShelter) {
        places = campus.placeIndex();
        nodes = campus.nodeIndex();
        roads = campus.edgeIndex();
        metersPerUnit = campus.calibration() == null ? 1 : campus.calibration().metersPerUnit();
        for (var edge : campus.edges()) {
            if (!edge.isWalkable() || !edge.open() || avoidStairs && edge.stairs()) continue;
            var shape=edge.shape(nodes);
            double length=0;
            for (int i=1;i<shape.size();i++) length+=shape.get(i-1).distanceTo(shape.get(i));
            double weight=preferShelter ? length*(Boolean.TRUE.equals(edge.covered())?1:1.8) : length;
            graph.computeIfAbsent(edge.a(), ignored -> new ArrayList<>()).add(new Arc(edge.b(), edge.id(), length,weight));
            graph.computeIfAbsent(edge.b(), ignored -> new ArrayList<>()).add(new Arc(edge.a(), edge.id(), length,weight));
        }
    }

    static List<String> requestedStops(Campus.RouteRequest request) {
        var list = new ArrayList<String>();
        list.add(request.start());
        if (request.via() != null) list.addAll(request.via());
        list.add(request.end());
        return list;
    }

    Campus.Route route(List<String> stops) {
        validateStops(stops);
        return run(stops, false).route();
    }

    Comparison compare(int revision, List<String> stops) {
        validateStops(stops);
        Run dijkstra = run(stops, false);
        Run astar = run(stops, true);
        return new Comparison(revision, astar.route(), dijkstra.metrics(), astar.metrics());
    }

    Plan itinerary(int revision, PlanRequest request) {
        var stops = request.stops();
        validateStops(stops);
        Problem.require(new HashSet<>(stops).size() == stops.size(), "行程站点须互不重复");
        int n = stops.size();
        var between = new double[n][n];
        for (int i=0; i<n; i++) {
            for (int j=i+1; j<n; j++) {
                var leg = leg(stops.get(i), stops.get(j), true);
                between[i][j] = between[j][i] = leg.distance();
            }
        }
        List<Integer> initial = new ArrayList<>();
        for (int i=0; i<n; i++) initial.add(i);
        List<Integer> order = initial;
        String method = "fixed";
        if (request.optimize() && n>2) {
            boolean exact = n-2 <= EXACT_LIMIT;
            method = exact ? "exact" : "nearest-2opt";
            order = exact ? exactOrder(between) : heuristic(between, initial);
        }
        List<String> chosen = order.stream().map(stops::get).toList();
        return new Plan(revision, method, List.copyOf(stops), chosen, rounded(cost(between, initial)*metersPerUnit),
            rounded(cost(between, order)*metersPerUnit), compare(revision, chosen));
    }

    private static List<Integer> exactOrder(double[][] costs) {
        int inner = costs.length-2, last = costs.length-1, masks = 1 << inner;
        double[][] optimal = new double[masks][inner];
        int[][] predecessor = new int[masks][inner];
        for (var row : optimal) Arrays.fill(row, Double.POSITIVE_INFINITY);
        for (int i=0; i<inner; i++) {
            optimal[1 << i][i] = costs[0][i+1];
            predecessor[1 << i][i] = -1;
        }
        for (int mask=1; mask<masks; mask++) {
            for (int end=0; end<inner; end++) {
                if (!Double.isFinite(optimal[mask][end])) continue;
                for (int next=0; next<inner; next++) {
                    if ((mask & (1 << next)) != 0) continue;
                    int merged = mask | (1 << next);
                    double value = optimal[mask][end] + costs[end+1][next+1];
                    if (value < optimal[merged][next]) {
                        optimal[merged][next] = value;
                        predecessor[merged][next] = end;
                    }
                }
            }
        }
        int mask = masks-1, end = 0;
        double best = Double.POSITIVE_INFINITY;
        for (int i=0; i<inner; i++) {
            double value = optimal[mask][i] + costs[i+1][last];
            if (value < best) { best = value; end = i; }
        }
        var order = new ArrayList<Integer>();
        order.add(last);
        while (end >= 0) {
            order.add(end+1);
            int previous = predecessor[mask][end];
            mask ^= 1 << end;
            end = previous;
        }
        order.add(0);
        return order.reversed();
    }

    private static List<Integer> heuristic(double[][] costs, List<Integer> initial) {
        var candidate = new ArrayList<Integer>();
        var pending = new ArrayList<>(initial.subList(1, initial.size()-1));
        candidate.add(0);
        while (!pending.isEmpty()) {
            int current = candidate.getLast();
            int next = pending.stream().min(Comparator.comparingDouble(index -> costs[current][index])).orElseThrow();
            pending.remove(Integer.valueOf(next));
            candidate.add(next);
        }
        candidate.add(initial.getLast());
        var order = new ArrayList<>(cost(costs, candidate) < cost(costs, initial) ? candidate : initial);
        boolean improved;
        do {
            improved = false;
            for (int i=1; i<order.size()-2; i++) {
                for (int j=i+1; j<order.size()-1; j++) {
                    int a=order.get(i-1), b=order.get(i), c=order.get(j), d=order.get(j+1);
                    if (costs[a][c]+costs[b][d]+1e-8 < costs[a][b]+costs[c][d]) {
                        Collections.reverse(order.subList(i,j+1));
                        improved = true;
                    }
                }
            }
        } while (improved);
        return order;
    }

    private void validateStops(List<String> stops) {
        Problem.require(stops != null && stops.size() >= 2 && stops.size() <= 14, "请选择 2–14 个地点");
        for (String id : stops) Problem.require(id != null && places.containsKey(id), "地点不存在");
    }

    private static double cost(double[][] matrix, List<Integer> order) {
        double total = 0;
        for (int i=1; i<order.size(); i++) total += matrix[order.get(i-1)][order.get(i)];
        return total;
    }

    private Run run(List<String> stops, boolean astar) {
        var points = new ArrayList<Campus.Node>();
        var edges = new ArrayList<String>();
        points.add(nodes.get(places.get(stops.getFirst()).entry()));
        var first=points.getFirst();
        var polyline=new ArrayList<Campus.RoadPoint>();
        polyline.add(new Campus.RoadPoint(first.x(),first.z()));
        double units = 0;
        int expanded = 0;
        long nanos = 0;
        for (int i=1; i<stops.size(); i++) {
            long started = System.nanoTime();
            Search found = leg(stops.get(i-1), stops.get(i), astar);
            nanos += System.nanoTime()-started;
            expanded += found.expanded();
            units += found.distance();
            found.nodes().stream().skip(1).map(nodes::get).forEach(points::add);
            edges.addAll(found.edges());
            for (int j=0;j<found.edges().size();j++) {
                var edge=roads.get(found.edges().get(j));
                var shape=edge.shape(nodes);
                var ordered=edge.a().equals(found.nodes().get(j)) ? shape : shape.reversed();
                polyline.addAll(ordered.subList(1,ordered.size()));
            }
        }
        double meters = units*metersPerUnit;
        var route = new Campus.Route(points, edges, polyline, rounded(meters), (int)Math.ceil(meters/SPEED), SPEED, true);
        return new Run(route, new Metrics(expanded,nanos,rounded(meters),stops.size()-1));
    }

    private Search leg(String from, String to, boolean astar) {
        var a = places.get(from);
        var b = places.get(to);
        Search found = shortest(a.entry(),b.entry(),astar);
        if (found == null) throw new Problem(422, a.name()+" → "+b.name()+" 不可达，请检查道路或调整途经点");
        return found;
    }

    private Search shortest(String start, String goal, boolean astar) {
        if (start.equals(goal)) return new Search(List.of(start), List.of(), 0, 0);
        var queue = new PriorityQueue<>(Comparator.comparingDouble(Visit::priority)
            .thenComparingDouble(Visit::cost).thenComparing(Visit::node));
        var best = new HashMap<String, Double>();
        var back = new HashMap<String, Arc>();
        int expanded = 0;
        queue.add(new Visit(start,0,astar ? distance(start,goal) : 0));
        best.put(start,0d);
        while (!queue.isEmpty()) {
            Visit current = queue.remove();
            if (current.cost() > best.get(current.node())) continue;
            expanded++;
            if (current.node().equals(goal)) {
                var points = new ArrayList<String>();
                var edges = new ArrayList<String>();
                double length=0;
                points.add(goal);
                for (String at = goal; !at.equals(start); ) {
                    Arc previous = back.get(at);
                    edges.add(previous.edge());
                    length+=previous.length();
                    at = previous.to();
                    points.add(at);
                }
                return new Search(points.reversed(),edges.reversed(),length,expanded);
            }
            for (Arc arc : graph.getOrDefault(current.node(),List.of())) {
                double next = current.cost()+arc.weight();
                if (next >= best.getOrDefault(arc.to(),Double.POSITIVE_INFINITY)) continue;
                best.put(arc.to(),next);
                back.put(arc.to(),new Arc(current.node(),arc.edge(),arc.length(),arc.weight()));
                queue.add(new Visit(arc.to(),next,next+(astar ? distance(arc.to(),goal) : 0)));
            }
        }
        return null;
    }

    private double distance(String a, String b) {
        var p=nodes.get(a);
        var q=nodes.get(b);
        return Math.hypot(p.x()-q.x(),p.z()-q.z());
    }

    private static double rounded(double value) { return Math.round(value*10)/10.0; }
}

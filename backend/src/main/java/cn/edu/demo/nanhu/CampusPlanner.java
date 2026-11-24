package cn.edu.demo.nanhu;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
class CampusPlanner {
    record Stop(String place,int minutes) {}
    record Input(String start,String end,List<Stop> stops,Integer dayOffset,String date,String startTime,String deadlineTime,
                 boolean avoidStairs,boolean preferShelter) {}
    record Window(Set<Integer> days,LocalTime opens,LocalTime closes) {}
    record Visit(String place,String name,Instant arrival,Instant departure,int minutes,String openingStatus) {}
    record Leg(String from,String to,Instant start,Instant arrival,Campus.Route route) {}
    record Result(int revision,boolean feasible,List<String> order,List<Visit> visits,List<Leg> legs,Campus.Route mapRoute,
                  Instant starts,Instant deadline,Instant arrival,List<String> notes,CampusEnvironment.Report weather,Input input) {}
    private record Candidate(List<String> order,List<Visit> visits,List<Leg> legs,Instant arrival,int conflicts,Set<String> notes) {}
    private record Pair(String from,String to) {}

    private final CampusStore store;
    private final CampusEnvironment environment;
    CampusPlanner(CampusStore store,CampusEnvironment environment){this.store=store;this.environment=environment;}

    Result plan(Input input) {return plan(store.snapshot(),input,environment.time().now());}

    Result plan(CampusStore.Snapshot snapshot,Input input,Instant now){
        var campus=snapshot.scene();var places=campus.placeIndex();
        Problem.require(input.start()!=null&&places.containsKey(input.start())&&input.end()!=null&&places.containsKey(input.end()),"请指定真实的起点和终点");
        var visits=new LinkedHashMap<String,Integer>();
        if(input.stops()!=null) for(Stop stop:input.stops()){
            Problem.require(stop!=null&&places.containsKey(stop.place())&&stop.minutes()>=0&&stop.minutes()<=180&&
                !input.start().equals(stop.place())&&!input.end().equals(stop.place())&&visits.putIfAbsent(stop.place(),stop.minutes())==null,
                "途经点须存在、互不重复，停留为 0–180 分钟");
        }
        Problem.require(visits.size()<=6,"时间约束行程最多支持 6 个中间站");
        LocalDate today=now.atZone(CampusEnvironment.ZONE).toLocalDate();
        LocalDate date=day(input,today);
        var absolute=new Input(input.start(),input.end(),input.stops(),null,date.toString(),input.startTime(),input.deadlineTime(),
            input.avoidStairs(),input.preferShelter());
        var starts=date.atTime(clock(input.startTime())).atZone(CampusEnvironment.ZONE).toInstant();
        var deadline=date.atTime(clock(input.deadlineTime())).atZone(CampusEnvironment.ZONE).toInstant();
        Problem.require(deadline.isAfter(starts),"截止时间须晚于开始时间并在同一北京日");
        var notes=new LinkedHashSet<String>();
        if(starts.isBefore(now)){starts=now;notes.add("已过计划开始时间，按校园当前时间出发。");}
        var forecast=environment.weather(starts,deadline);
        if(forecast.forecast().isEmpty()||! "live".equals(forecast.state())){
            notes.add("指定时间的可靠预报暂不可用，天气约束未确认。");
        } else {
            var first=forecast.forecast().getFirst().validAt();
            var last=forecast.forecast().getLast().validAt().plusSeconds(3600);
            if(first.isAfter(starts)||last.isBefore(deadline))notes.add("预报未覆盖全部行程时段。");
        }
        boolean precip=forecast.forecast().stream().anyMatch(w->(w.precipitation()!=null&&w.precipitation()>.1)||
            (w.precipitationProbability()!=null&&w.precipitationProbability()>=55));
        boolean useCover=input.preferShelter()&&campus.edges().stream().anyMatch(e->e.isWalkable()&&e.open()&&Boolean.TRUE.equals(e.covered()));
        if(input.preferShelter()){
            if(!useCover)notes.add("当前道路没有已核实的遮蔽路段，按通行距离规划，无法保证避雨。");
            else if(precip)notes.add("预报有降水风险，优先选择有遮蔽的已知路段，未标注路段按未确认处理。");
            else notes.add("已按你的偏好优先选择有遮蔽的已知路段。");
        }
        notes.add("距离来自道路图与校园估算比例，步速为 1.25 米/秒。");
        var routing=new Routing(campus,input.avoidStairs(),useCover);
        var cache=new HashMap<Pair,Optional<Campus.Route>>();
        var orders=new ArrayList<List<String>>();
        permutations(new ArrayList<>(visits.keySet()),0,orders);
        Candidate best=null;
        for(List<String> inner:orders){
            var order=new ArrayList<String>();
            order.add(input.start());order.addAll(inner);order.add(input.end());
            var candidate=evaluate(order,visits,places,routing,cache,starts,deadline);
            if(candidate!=null && (best==null || candidate.conflicts()<best.conflicts() ||
                candidate.conflicts()==best.conflicts()&&candidate.arrival().isBefore(best.arrival())))best=candidate;
        }
        if(best==null){
            notes.add("至少一处入口在指定道路约束下不可达，尝试更换站点或重新核对封闭道路。");
            return new Result(snapshot.revision(),false,List.of(),List.of(),List.of(),null,starts,deadline,null,List.copyOf(notes),forecast,absolute);
        }
        notes.addAll(best.notes());
        if(best.arrival().isAfter(deadline))notes.add("预计晚于截止时间。可提前出发、缩短停留或拆分行程。");
        if(best.conflicts()>0)notes.add("部分访问跨出已知开放时间。可改日、调整停留或更换地点。");
        return new Result(snapshot.revision(),best.conflicts()==0&&!best.arrival().isAfter(deadline),
            best.order(),best.visits(),best.legs(),merge(best.legs()),starts,deadline,best.arrival(),List.copyOf(notes),forecast,absolute);
    }

    private static Candidate evaluate(List<String> order,Map<String,Integer> waits,Map<String,Campus.Place> places,
                                      Routing routing,Map<Pair,Optional<Campus.Route>> cache,Instant starts,Instant deadline){
        var legs=new ArrayList<Leg>();var stops=new ArrayList<Visit>();var notes=new LinkedHashSet<String>();
        int conflicts=0;
        var time=starts;
        for(int i=0;i<order.size();i++){
            String id=order.get(i);
            if(i>0){
                var pair=new Pair(order.get(i-1),id);
                var route=cache.computeIfAbsent(pair,p->{
                    try{return Optional.of(routing.route(List.of(p.from(),p.to())));}
                    catch(Problem e){if(e.status!=422)throw e;return Optional.empty();}
                });
                if(route.isEmpty())return null;
                var eta=time.plusSeconds(route.get().seconds());
                legs.add(new Leg(pair.from(),id,time,eta,route.get()));time=eta;
            }
            var p=places.get(id);
            int duration=waits.getOrDefault(id,0);
            String status=i==0?"出发": "开放时间未知";
            Instant actual=time;
            if(i>0){
                var filter=p.openingHours();
                if(filter==null||filter.isBlank()){notes.add(p.name()+"的开放时间未知。");}
                else {
                    var adjusted=nextOpening(time,duration,deadline,hours(filter));
                    if(adjusted==null){status="开放时间冲突";conflicts++;}
                    else {
                        actual=adjusted;
                        status=actual.equals(time)?"在开放时段":"到达后等待开放";
                    }
                }
            }
            time=actual.plusSeconds(duration*60L);
            stops.add(new Visit(id,p.name(),actual,time,duration,status));
        }
        return new Candidate(order,stops,legs,time,conflicts,notes);
    }

    private static Instant nextOpening(Instant time,int minutes,Instant deadline,List<Window> windows){
        var local=time.atZone(CampusEnvironment.ZONE);Instant best=null;
        for(Window w:windows){
            if(!w.days().contains(local.getDayOfWeek().getValue()))continue;
            var open=local.toLocalDate().atTime(w.opens()).atZone(CampusEnvironment.ZONE).toInstant();
            var close=local.toLocalDate().atTime(w.closes()).atZone(CampusEnvironment.ZONE).toInstant();
            var start=time.isAfter(open)?time:open;
            if(start.isAfter(deadline)||!start.isBefore(close)||start.plusSeconds(minutes*60L).isAfter(close))continue;
            if(best==null||start.isBefore(best))best=start;
        }
        return best;
    }

    static void checkHours(String field){hours(field);}
    static List<Window> hours(String field){
        Problem.require(field.length()<=250,"开放时间最多 250 字");
        var windows=new ArrayList<Window>();
        for(String row:field.trim().split(";")){
            var sides=row.trim().split("@",-1);
            Problem.require(sides.length==2,"开放时间格式为 *@09:00-18:00 或 1,2,3,4,5@09:00-18:00");
            var days=new LinkedHashSet<Integer>();
            if(sides[0].equals("*"))days.addAll(List.of(1,2,3,4,5,6,7));
            else for(String d:sides[0].split(",")){
                Problem.require(d.matches("[1-7]"),"开放时间星期用 1 到 7");
                days.add(Integer.valueOf(d));
            }
            var time=sides[1].split("-",-1);
            Problem.require(time.length==2,"开放时间应使用起止时刻");
            var from=clock(time[0]);var to=clock(time[1]);
            Problem.require(to.isAfter(from),"开放时间须是当天正向区间");
            windows.add(new Window(days,from,to));
        }
        return windows;
    }
    private static LocalTime clock(String value){
        Problem.require(value!=null&&value.matches("[0-9]{2}:[0-9]{2}"),"请使用 24 小时制 HH:mm");
        try{return LocalTime.parse(value);}catch(DateTimeException e){throw new Problem(400,"时刻无效");}
    }
    private static LocalDate day(Input input,LocalDate today){
        try{
            LocalDate date=input.date()==null||input.date().isBlank()?today.plusDays(input.dayOffset()==null?0:input.dayOffset()):LocalDate.parse(input.date());
            Problem.require(!date.isBefore(today)&&!date.isAfter(today.plusDays(60)),"请选择从今天起 60 天内的日期");
            return date;
        }catch(DateTimeException e){throw new Problem(400,"日期无效");}
    }
    private static void permutations(List<String> row,int i,List<List<String>> orders){
        if(i>=row.size()){orders.add(List.copyOf(row));return;}
        for(int j=i;j<row.size();j++){
            Collections.swap(row,i,j);permutations(row,i+1,orders);Collections.swap(row,i,j);
        }
    }
    private static Campus.Route merge(List<Leg> legs){
        var nodes=new ArrayList<Campus.Node>();var edges=new ArrayList<String>();
        var polyline=new ArrayList<Campus.RoadPoint>();
        double meters=0;int seconds=0;
        for(var leg:legs){
            var r=leg.route();
            r.points().stream().skip(nodes.isEmpty()?0:1).forEach(nodes::add);
            r.polyline().stream().skip(polyline.isEmpty()?0:1).forEach(polyline::add);
            edges.addAll(r.edges());meters+=r.meters();seconds+=r.seconds();
        }
        return new Campus.Route(nodes,edges,polyline,Math.round(meters*10)/10d,seconds,1.25,true);
    }
}

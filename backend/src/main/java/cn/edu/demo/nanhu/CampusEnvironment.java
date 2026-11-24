package cn.edu.demo.nanhu;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class CampusEnvironment {
    static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
    static final double LAT=30.51079, LON=114.35391;
    static final String SOURCE="Open-Meteo";
    record Time(Instant now,String zone,double latitude,double longitude) {}
    record Weather(Instant validAt,Double temperature,Double cloud,Double precipitation,Double rain,
                   Double snowfall,Integer code,Double visibility,Double precipitationProbability) {}
    record Report(String state,String source,Instant fetchedAt,Weather current,List<Weather> forecast) {}

    private final ObjectMapper json;
    private final URI url;
    private final String source;
    private final Duration fresh,retry;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
    private volatile Report cache;
    private volatile Instant nextAttempt=Instant.EPOCH;

    CampusEnvironment(ObjectMapper json,@Value("${nanhu.weather.endpoint:https://api.open-meteo.com/v1/forecast}") String root,
                      @Value("${nanhu.weather.fresh:PT15M}") Duration fresh,@Value("${nanhu.weather.retry:PT2M}") Duration retry) {
        this.json=json;
        this.fresh=fresh;
        this.retry=retry;
        url=URI.create(root+"?latitude="+LAT+"&longitude="+LON+
            "&current=temperature_2m,cloud_cover,precipitation,rain,snowfall,weather_code"+
            "&hourly=temperature_2m,cloud_cover,precipitation,rain,snowfall,weather_code,visibility,precipitation_probability"+
            "&timeformat=unixtime&timezone=GMT&forecast_days=7");
        source=Set.of("localhost","127.0.0.1","[::1]").contains(url.getHost())?"测试气象服务":SOURCE;
    }

    Time time() {return new Time(Instant.now(),ZONE.getId(),LAT,LON);}

    Report weather(Instant from,Instant until) {
        Report latest=get();
        if(latest==null) return new Report("unavailable",source,null,null,List.of());
        String state=Instant.now().isAfter(latest.fetchedAt().plus(fresh)) ||
            latest.current()==null || latest.current().validAt().isBefore(Instant.now().minus(Duration.ofMinutes(45))) ? "stale":"live";
        var hours=from==null||until==null ? List.<Weather>of() : latest.forecast().stream()
            .filter(w->!w.validAt().isBefore(from.truncatedTo(java.time.temporal.ChronoUnit.HOURS))&&
                !w.validAt().isAfter(until)).toList();
        return new Report(state,source,latest.fetchedAt(),latest.current(),hours);
    }

    private Report get() {
        if(Instant.now().isBefore(nextAttempt)) return cache;
        synchronized(this) {
            if(Instant.now().isBefore(nextAttempt)) return cache;
            nextAttempt=Instant.now().plus(retry);
            try {
                var request=HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(8))
                    .header("Accept","application/json").GET().build();
                var response=http.send(request,HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200) return cache;
                var payload=json.readTree(response.body());
                JsonNode current=payload.path("current"), hour=payload.path("hourly");
                Weather now=sample(current,-1);
                if(now==null) return cache;
                var hours=new ArrayList<Weather>();
                for(int i=0;i<Math.min(192,hour.path("time").size());i++){
                    Weather sample=sample(hour,i);
                    if(sample!=null) hours.add(sample);
                }
                if(now.visibility()==null) {
                    final Instant validAt=now.validAt();
                    var visible=hours.stream().filter(h->h.visibility()!=null&&Math.abs(h.validAt().getEpochSecond()-validAt.getEpochSecond())<3600)
                        .min(Comparator.comparingLong(h->Math.abs(h.validAt().getEpochSecond()-validAt.getEpochSecond())));
                    if(visible.isPresent()) now=new Weather(now.validAt(),now.temperature(),now.cloud(),now.precipitation(),
                        now.rain(),now.snowfall(),now.code(),visible.get().visibility(),now.precipitationProbability());
                }
                cache=new Report("live",source,Instant.now(),now,List.copyOf(hours));
                nextAttempt=Instant.now().plus(fresh);
            } catch(InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch(IOException | RuntimeException ignored) {
                // The last successful sample remains available during an upstream outage.
            }
            return cache;
        }
    }

    static Weather sample(JsonNode fields,int i) {
        JsonNode time=value(fields,"time",i),code=value(fields,"weather_code",i);
        if(!time.isIntegralNumber()||time.asLong()<1) return null;
        return new Weather(Instant.ofEpochSecond(time.asLong()),number(fields,"temperature_2m",i),number(fields,"cloud_cover",i),
            number(fields,"precipitation",i),number(fields,"rain",i),number(fields,"snowfall",i),
            code.isIntegralNumber()?code.asInt():null,number(fields,"visibility",i),number(fields,"precipitation_probability",i));
    }
    private static JsonNode value(JsonNode f,String field,int i) {return i<0?f.path(field):f.path(field).path(i);}
    private static Double number(JsonNode f,String field,int i) {
        JsonNode value=value(f,field,i);
        return value.isNumber()&&Double.isFinite(value.asDouble())?value.asDouble():null;
    }
}

@RestController
@RequestMapping("/api/environment")
class EnvironmentApi {
    private final CampusEnvironment environment;
    EnvironmentApi(CampusEnvironment environment){this.environment=environment;}
    @GetMapping("/time") CampusEnvironment.Time time(){return environment.time();}
    @GetMapping("/weather") CampusEnvironment.Report weather(){return environment.weather(null,null);}
}

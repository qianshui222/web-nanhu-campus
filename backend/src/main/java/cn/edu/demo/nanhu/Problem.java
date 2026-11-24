package cn.edu.demo.nanhu;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;

class Problem extends RuntimeException {
    final int status;

    Problem(int status, String text) {
        super(text);
        this.status = status;
    }

    static void require(boolean ok, String message) {
        if (!ok) throw new Problem(400, message);
    }
}

@RestControllerAdvice
class Problems {
    @ExceptionHandler(Problem.class) ResponseEntity<Map<String, String>> problem(Problem ex) {
        return ResponseEntity.status(ex.status).body(Map.of("message", ex.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<Map<String, String>> invalidJson() {
        return ResponseEntity.badRequest().body(Map.of("message", "请求格式有误"));
    }
}

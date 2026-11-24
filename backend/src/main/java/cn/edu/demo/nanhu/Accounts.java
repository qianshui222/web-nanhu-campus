package cn.edu.demo.nanhu;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class Accounts {
    record Credentials(String username, String password) {}
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authManager;
    private final SecurityContextRepository contexts;

    Accounts(JdbcTemplate db, PasswordEncoder encoder, AuthenticationManager authManager,
             SecurityContextRepository contexts) {
        this.db = db;
        this.encoder = encoder;
        this.authManager = authManager;
        this.contexts = contexts;
    }

    @Bean ApplicationRunner sampleAccounts(@Value("${nanhu.demo}") boolean demo) {
        return args -> {
            if (demo) {
                insertDemo("student", "NanhuStudent21", "USER");
                insertDemo("admin", "NanhuAdmin21", "ADMIN");
            }
        };
    }

    private void insertDemo(String name, String pass, String role) {
        if (db.queryForObject("SELECT COUNT(*) FROM accounts WHERE username = ?", Integer.class, name) == 0) {
            insert(name, pass, role);
        }
    }

    private void insert(String name, String pass, String role) {
        db.update("INSERT INTO accounts VALUES (?, ?, ?)", name, encoder.encode(pass), role);
    }

    @GetMapping("/csrf") Map<String, String> csrf(CsrfToken token) {
        return Map.of("header", token.getHeaderName(), "token", token.getToken());
    }

    @GetMapping("/session") Map<String, Object> session(Authentication auth) {
        if (auth == null) return Map.of("signedIn", false);
        return Map.of("signedIn", true, "username", auth.getName(), "admin",
            auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")));
    }

    @PostMapping("/register") Map<String, String> register(@RequestBody Credentials input) {
        String name = normalize(input.username());
        String pass = input.password();
        Problem.require(name.matches("[a-z0-9_]{3,32}"), "账号须为 3–32 位英文字母、数字或下划线");
        Problem.require(pass != null && pass.length() >= 8 && pass.getBytes(StandardCharsets.UTF_8).length <= 72,
            "密码至少 8 个字符且最多 72 字节");
        try { insert(name, pass, "USER"); }
        catch (DuplicateKeyException ex) { throw new Problem(409, "账号已存在"); }
        return Map.of("username", name);
    }

    @PostMapping("/login") Map<String, Object> login(@RequestBody Credentials input, HttpServletRequest req, HttpServletResponse res) {
        Authentication auth;
        try {
            auth = authManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(
                normalize(input.username()), input.password()));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            throw new Problem(401, "账号或密码有误");
        }
        if (req.getSession(false) != null) req.changeSessionId();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, req, res);
        return session(auth);
    }

    private String normalize(String name) { return name == null ? "" : name.trim().toLowerCase(Locale.ROOT); }
}

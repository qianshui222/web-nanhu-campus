package cn.edu.demo.nanhu;

import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration
class SecurityConfig {
    @Bean PasswordEncoder encoder() { return new BCryptPasswordEncoder(); }

    @Bean UserDetailsService users(JdbcTemplate db) {
        return name -> db.query("SELECT * FROM accounts WHERE username = ?", (rs, row) ->
            User.withUsername(rs.getString("username")).password(rs.getString("password_hash"))
                .roles(rs.getString("role_name")).build(), name).stream().findFirst()
            .orElseThrow(() -> new UsernameNotFoundException(name));
    }

    @Bean AuthenticationManager authentication(UserDetailsService users, PasswordEncoder encoder) {
        var provider = new org.springframework.security.authentication.dao.DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    @Bean SecurityContextRepository contexts() { return new HttpSessionSecurityContextRepository(); }

    @Bean SecurityFilterChain chain(HttpSecurity http, SecurityContextRepository contexts) throws Exception {
        return http.securityContext(c -> c.securityContextRepository(contexts))
            .csrf(c -> c.csrfTokenRepository(new HttpSessionCsrfTokenRepository()))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/environment/**", "/api/agent/status").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/agent", "/api/agent/plan").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/scene", "/api/session", "/api/csrf").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/route", "/api/route/compare", "/api/itinerary/plan", "/api/register", "/api/login").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> res.sendError(401))
                .accessDeniedHandler((req, res, ex) -> res.sendError(403)))
            .logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler((req, res, auth) -> res.setStatus(204)))
            .build();
    }
}

// package com.example.reelcry.config;

// import org.springframework.context.annotation.Bean;
// import org.springframework.context.annotation.Configuration;
// import org.springframework.security.config.annotation.web.builders.HttpSecurity;
// import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
// import org.springframework.security.core.userdetails.User;
// import org.springframework.security.core.userdetails.UserDetails;
// import org.springframework.security.provisioning.InMemoryUserDetailsManager;
// import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
// import org.springframework.security.crypto.password.PasswordEncoder;
// import org.springframework.security.web.SecurityFilterChain;

// @Configuration
// @EnableWebSecurity
// public class SecurityConfig {

//     // ĐỔI username/password ở đây thành thứ bạn muốn dùng
//     private static final String USERNAME_1 = "admin";
//     private static final String PASSWORD_1 = "reelcry@2026";

//     private static final String USERNAME_2 = "family";
//     private static final String PASSWORD_2 = "xemphim@2026";

//     @Bean
//     public PasswordEncoder passwordEncoder() {
//         return new BCryptPasswordEncoder();
//     }

//     @Bean
//     public InMemoryUserDetailsManager userDetailsService(PasswordEncoder encoder) {
//         UserDetails user1 = User.withUsername(USERNAME_1)
//                 .password(encoder.encode(PASSWORD_1))
//                 .roles("USER")
//                 .build();

//         UserDetails user2 = User.withUsername(USERNAME_2)
//                 .password(encoder.encode(PASSWORD_2))
//                 .roles("USER")
//                 .build();

//         return new InMemoryUserDetailsManager(user1, user2);
//     }

//     @Bean
//     public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
//         http
//             .authorizeHttpRequests(auth -> auth
//                 .requestMatchers("/login", "/css/**", "/js/**", "/images/**", "/webjars/**").permitAll()
//                 .anyRequest().authenticated()
//             )
//             .formLogin(form -> form
//                 .loginPage("/login")
//                 .defaultSuccessUrl("/", true)
//                 .permitAll()
//             )
//             .logout(logout -> logout
//                 .logoutUrl("/logout")
//                 .logoutSuccessUrl("/login?logout")
//                 .permitAll()
//             );

//         return http.build();
//     }
// }
package com.example.reelcry.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.auth.username1:admin}")
    private String username1;
    @Value("${app.auth.password1:123}")
    private String password1;

    @Value("${app.auth.username2:family}")
    private String username2;
    @Value("${app.auth.password2:123}")
    private String password2;

    // Khoá bí mật để ký cookie "ghi nhớ đăng nhập" - nên đặt cố định qua biến
    // môi trường (nếu đổi mỗi lần deploy thì các cookie remember-me cũ sẽ bị
    // vô hiệu, buộc đăng nhập lại)
    @Value("${app.security.remember-key:reelcry-remember-me-secret-key}")
    private String rememberMeKey;

    // Thời hạn cookie "ghi nhớ đăng nhập" - 30 ngày, khớp với thời hạn session
    // (server.servlet.session.timeout) để trải nghiệm nhất quán
    private static final int REMEMBER_ME_VALIDITY_SECONDS = 30 * 24 * 60 * 60;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public InMemoryUserDetailsManager userDetailsService(PasswordEncoder encoder) {
        UserDetails user1 = User.withUsername(username1)
                .password(encoder.encode(password1))
                .roles("USER")
                .build();

        UserDetails user2 = User.withUsername(username2)
                .password(encoder.encode(password2))
                .roles("USER")
                .build();

        return new InMemoryUserDetailsManager(user1, user2);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/**"))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/error", "/css/**", "/js/**", "/images/**", "/webjars/**",
                        "/manifest.json", "/sw.js", "/offline.html").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/", true)
                .permitAll()
            )
            // "Ghi nhớ đăng nhập": phát hành 1 cookie riêng (persistent-remember-me
            // cookie), sống độc lập với session - nên vẫn tự đăng nhập lại được kể
            // cả khi người dùng đóng hẳn trình duyệt (cookie session JSESSIONID
            // mặc định sẽ mất khi đóng trình duyệt, khác với cookie này)
            .rememberMe(remember -> remember
                .key(rememberMeKey)
                .tokenValiditySeconds(REMEMBER_ME_VALIDITY_SECONDS)
                .rememberMeParameter("remember-me")
                .userDetailsService(userDetailsService(passwordEncoder()))
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login?logout")
                .deleteCookies("remember-me")
                .permitAll()
            );

        return http.build();
    }
}
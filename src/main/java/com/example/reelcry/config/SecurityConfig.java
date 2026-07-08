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
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/css/**", "/js/**", "/images/**", "/webjars/**").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/", true)
                .permitAll()
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login?logout")
                .permitAll()
            );

        return http.build();
    }
}
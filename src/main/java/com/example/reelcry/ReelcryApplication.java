package com.example.reelcry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class ReelcryApplication {

	public static void main(String[] args) {
		SpringApplication.run(ReelcryApplication.class, args);
	}

}

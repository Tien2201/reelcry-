package com.example.reelcry.controller;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URI;
import java.util.Set;

@RestController
public class ImageProxyController {

    private final WebClient imageWebClient;

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "img.ophim.live",
            "phimimg.com",
            "img.phimapi.com"
    );

    public ImageProxyController() {
        this.imageWebClient = WebClient.builder().build();
    }

    @GetMapping("/img-proxy")
    public ResponseEntity<byte[]> proxyImage(@RequestParam String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            if (host == null || !ALLOWED_HOSTS.contains(host)) {
                return ResponseEntity.badRequest().build();
            }

            byte[] bytes = imageWebClient.get()
                    .uri(uri)
                    .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36")
                    .header(HttpHeaders.REFERER, "https://ophim1.com/")
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();

            if (bytes == null || bytes.length == 0) {
                return ResponseEntity.notFound().build();
            }

            String contentType = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, contentType)
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=604800")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}
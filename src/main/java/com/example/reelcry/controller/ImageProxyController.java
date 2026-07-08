package com.example.reelcry.controller;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@RestController
public class ImageProxyController {

    private final WebClient imageWebClient;

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "img.ophim.live",
            "phimimg.com",
            "img.phimapi.com"
    );

    // Các domain ảnh dự phòng để thử lần lượt nếu domain chính bị treo/lỗi
    private static final List<String> FALLBACK_HOSTS = List.of(
            "phimimg.com",
            "img.phimapi.com"
    );

    public ImageProxyController() {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 4000)
                .responseTimeout(Duration.ofSeconds(5))
                .doOnConnected(conn -> conn.addHandlerLast(new ReadTimeoutHandler(5, TimeUnit.SECONDS)));

        this.imageWebClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    @GetMapping("/img-proxy")
    public ResponseEntity<byte[]> proxyImage(@RequestParam String url) {
        URI originalUri = URI.create(url);
        String host = originalUri.getHost();

        if (host == null || !ALLOWED_HOSTS.contains(host)) {
            System.err.println("[img-proxy] Host không hợp lệ: " + host);
            return ResponseEntity.badRequest().build();
        }

        // Thử domain gốc trước, timeout 5s
        byte[] bytes = tryFetch(originalUri, url);

        // Nếu domain gốc thất bại, thử lần lượt các domain dự phòng cùng đường dẫn ảnh
        if (bytes == null) {
            for (String fallbackHost : FALLBACK_HOSTS) {
                if (fallbackHost.equals(host)) continue;
                String fallbackUrl = url.replace(host, fallbackHost);
                System.err.println("[img-proxy] Thử domain dự phòng: " + fallbackUrl);
                bytes = tryFetch(URI.create(fallbackUrl), fallbackUrl);
                if (bytes != null) break;
            }
        }

        if (bytes == null) {
            System.err.println("[img-proxy] Thất bại toàn bộ cho: " + url);
            return ResponseEntity.notFound().build();
        }

        String contentType = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=604800")
                .body(bytes);
    }

    private byte[] tryFetch(URI uri, String urlForLog) {
        try {
            return imageWebClient.get()
                    .uri(uri)
                    .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36")
                    .header(HttpHeaders.REFERER, "https://ophim1.com/")
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();
        } catch (Exception e) {
            System.err.println("[img-proxy] Lỗi tải " + urlForLog + " -> " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return null;
        }
    }
}
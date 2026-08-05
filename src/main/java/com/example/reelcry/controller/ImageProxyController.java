// package com.example.reelcry.controller;

// import org.springframework.cache.annotation.Cacheable;
// import org.springframework.http.HttpHeaders;
// import org.springframework.http.ResponseEntity;
// import org.springframework.stereotype.Service;
// import org.springframework.web.bind.annotation.GetMapping;
// import org.springframework.web.bind.annotation.RequestParam;
// import org.springframework.web.bind.annotation.RestController;
// import org.springframework.web.reactive.function.client.WebClient;

// import java.net.URI;
// import java.util.Set;

// @RestController
// public class ImageProxyController {

//     private final WebClient imageWebClient;

//     private static final Set<String> ALLOWED_HOSTS = Set.of(
//             "img.ophim.live",
//             "phimimg.com",
//             "img.phimapi.com"
//     );

//     public ImageProxyController() {
//         this.imageWebClient = WebClient.builder().build();
//     }

//     @GetMapping("/img-proxy")
//     public ResponseEntity<byte[]> proxyImage(@RequestParam String url) {
//         try {
//             URI uri = URI.create(url);
//             String host = uri.getHost();
//             if (host == null || !ALLOWED_HOSTS.contains(host)) {
//                 return ResponseEntity.badRequest().build();
//             }

//             byte[] bytes = imageWebClient.get()
//                     .uri(uri)
//                     .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36")
//                     .header(HttpHeaders.REFERER, "https://ophim1.com/")
//                     .retrieve()
//                     .bodyToMono(byte[].class)
//                     .block();

//             if (bytes == null || bytes.length == 0) {
//                 return ResponseEntity.notFound().build();
//             }

//             String contentType = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

//             return ResponseEntity.ok()
//                     .header(HttpHeaders.CONTENT_TYPE, contentType)
//                     .header(HttpHeaders.CACHE_CONTROL, "public, max-age=604800")
//                     .body(bytes);
//         } catch (Exception e) {
//             return ResponseEntity.notFound().build();
//         }
//     }
// }
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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@RestController
public class ImageProxyController {

    private final WebClient imageWebClient;

    // Cache ảnh trong RAM — dùng chung cho mọi người dùng, mất khi app restart.
    // QUAN TRỌNG: dùng LRU thật sự (tự xoá ảnh cũ nhất/ít dùng nhất khi đầy)
    // thay vì map thường chỉ "ngừng cache khi đầy" - cách cũ vẫn giữ nguyên
    // 500 ảnh đầu tiên mãi mãi trong RAM, cộng dồn với cache phim ở
    // MovieService là nguyên nhân chính gây tràn RAM (Render OOM-kill mỗi
    // 30-90 phút). Giảm cap xuống 150 ảnh vì mỗi ảnh có thể vài trăm KB.
    private static final int MAX_CACHE_SIZE = 150;
    private final Map<String, byte[]> imageCache = Collections.synchronizedMap(
            new LinkedHashMap<String, byte[]>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, byte[]> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    // Giới hạn tối đa 6 request tải ảnh chạy song song, tránh dội quá tải domain
    // nguồn
    private final Semaphore semaphore = new Semaphore(6);

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "img.ophim.live",
            "phimimg.com",
            "img.phimapi.com");

    public ImageProxyController() {
    HttpClient httpClient = HttpClient.create()
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 4000)
            .responseTimeout(Duration.ofSeconds(5))
            .doOnConnected(conn -> conn.addHandlerLast(new ReadTimeoutHandler(5, TimeUnit.SECONDS)));

    this.imageWebClient = WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(4 * 1024 * 1024)) // 4MB thay vì 256KB mặc định - đủ cho ảnh poster, tránh chiếm quá nhiều RAM khi có nhiều request đồng thời
            .build();
}

    @GetMapping("/img-proxy")
    public ResponseEntity<byte[]> proxyImage(@RequestParam String url) {
        URI uri = URI.create(url);
        String host = uri.getHost();

        if (host == null || !ALLOWED_HOSTS.contains(host)) {
            return ResponseEntity.badRequest().build();
        }

        byte[] cached = imageCache.get(url);
        if (cached != null) {
            return buildResponse(url, cached);
        }

        byte[] bytes = null;
        for (int attempt = 1; attempt <= 5 && bytes == null; attempt++) {
            bytes = tryFetch(uri, url, attempt);
        }

        if (bytes == null) {
            System.err.println("[img-proxy] Thất bại sau 3 lần thử: " + url);
            return ResponseEntity.notFound().build();
        }

        // Không cache ảnh quá lớn (backdrop/ảnh gốc độ phân giải cao) để tránh 1
        // ảnh nặng chiếm quá nhiều RAM / đẩy văng nhiều ảnh nhỏ khác cùng lúc
        if (bytes.length <= 1_500_000) {
            imageCache.put(url, bytes);
        }

        return buildResponse(url, bytes);
    }

    private ResponseEntity<byte[]> buildResponse(String url, byte[] bytes) {
        String contentType = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=604800")
                .body(bytes);
    }

    private byte[] tryFetch(URI uri, String urlForLog, int attempt) {
        try {
            semaphore.acquire();
            try {
                return imageWebClient.get()
                        .uri(uri)
                        .header(HttpHeaders.USER_AGENT,
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36")
                        .header(HttpHeaders.REFERER, "https://ophim1.com/")
                        .retrieve()
                        .bodyToMono(byte[].class)
                        .block();
            } finally {
                semaphore.release();
            }

        } catch (org.springframework.web.reactive.function.client.WebClientResponseException e) {
            System.err.println("[img-proxy] Lần " + attempt + " lỗi HTTP " + e.getStatusCode()
                    + " cho " + urlForLog
                    + " | message=" + e.getMessage()
                    + " | body=" + e.getResponseBodyAsString());
            return null;
        } catch (Exception e) {
            System.err.println("[img-proxy] Lần " + attempt + " lỗi " + urlForLog + " -> "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
            return null;
        }
    }
}
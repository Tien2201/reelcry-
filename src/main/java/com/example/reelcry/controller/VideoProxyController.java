package com.example.reelcry.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Proxy cho video HLS (.m3u8 + các đoạn .ts/.m4s bên trong) - dùng để phát
 * video bằng trình phát HTML5 tự dựng (thay vì nhúng iframe của bên thứ 3),
 * cho phép đọc chính xác vị trí đang xem (currentTime) để làm tính năng
 * "tiếp tục xem đúng giây" thay vì chỉ ước lượng.
 *
 * Nhiều CDN video chặn hotlink (chỉ cho phép tải từ đúng trang/nguồn của họ)
 * dựa vào header Referer, nên trình duyệt không thể gọi thẳng tới CDN - phải
 * đi qua server Reelcry, giả Referer hợp lệ, rồi chuyển tiếp lại cho trình
 * duyệt. Đây là kỹ thuật thử nghiệm: nếu CDN chặn theo cách khác (token
 * ký theo IP, User-Agent lạ...) thì proxy này có thể vẫn thất bại - phía
 * trình phát cần có phương án dự phòng quay lại iframe khi gặp lỗi.
 */
@RestController
@RequestMapping("/video-proxy")
public class VideoProxyController {

    private final WebClient webClient;

    public VideoProxyController(WebClient.Builder builder) {
        this.webClient = builder
                .defaultHeader(HttpHeaders.USER_AGENT,
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .build();
    }

    @GetMapping("/manifest")
    public Mono<ResponseEntity<String>> manifest(@RequestParam String url, @RequestParam(required = false) String ref) {
        String referer = (ref != null && !ref.isBlank()) ? ref : originOf(url);

        return webClient.get()
                .uri(URI.create(url))
                .header(HttpHeaders.REFERER, referer)
                .retrieve()
                .bodyToMono(String.class)
                .map(body -> rewrite(body, url, ref))
                .map(rewritten -> ResponseEntity.ok()
                        .contentType(MediaType.valueOf("application/vnd.apple.mpegurl"))
                        .header(HttpHeaders.CACHE_CONTROL, "no-store")
                        .body(rewritten))
                .onErrorResume(e -> Mono.just(ResponseEntity.status(502)
                        .body("#EXTM3U\n# proxy error: " + e.getMessage() + "\n")));
    }

    @GetMapping("/segment")
    public Mono<ResponseEntity<byte[]>> segment(@RequestParam String url, @RequestParam(required = false) String ref) {
        String referer = (ref != null && !ref.isBlank()) ? ref : originOf(url);

        return webClient.get()
                .uri(URI.create(url))
                .header(HttpHeaders.REFERER, referer)
                .retrieve()
                .toEntity(byte[].class)
                .map(upstream -> {
                    MediaType type = upstream.getHeaders().getContentType();
                    ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                            .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400");
                    if (type != null) {
                        builder.contentType(type);
                    }
                    return builder.body(upstream.getBody());
                })
                .onErrorResume(e -> Mono.just(ResponseEntity.status(502).build()));
    }

    // Viết lại nội dung file .m3u8: mọi dòng không phải comment (#...) là 1 URI
    // trỏ tới segment hoặc 1 playlist con khác - đổi thành URL đi qua proxy này.
    private String rewrite(String playlistBody, String manifestUrl, String ref) {
        StringBuilder out = new StringBuilder();
        String[] lines = playlistBody.split("\n", -1);
        URI base = URI.create(manifestUrl);

        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                out.append(line).append("\n");
                continue;
            }

            String absolute;
            try {
                absolute = base.resolve(trimmed).toString();
            } catch (Exception e) {
                out.append(line).append("\n");
                continue;
            }

            String endpoint = absolute.contains(".m3u8") ? "/video-proxy/manifest" : "/video-proxy/segment";
            String proxied = endpoint + "?url=" + encode(absolute) + (ref != null ? "&ref=" + encode(ref) : "");
            out.append(proxied).append("\n");
        }
        return out.toString();
    }

    private String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private String originOf(String url) {
        try {
            URI u = URI.create(url);
            return u.getScheme() + "://" + u.getHost() + "/";
        } catch (Exception e) {
            return "";
        }
    }
}

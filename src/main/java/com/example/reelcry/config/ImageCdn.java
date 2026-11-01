package com.example.reelcry.config;

import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

// Tạo link ảnh qua CDN ảnh miễn phí của WordPress (i0.wp.com - "Photon").
//
// Lý do: CDN gốc của KKPhim (phimimg.com) truyền dữ liệu rất chậm về mạng
// Việt Nam (đo được ~3-8KB/giây: 1 poster 60KB mất 10-25 giây) nên rất
// nhiều ảnh không tải được. Photon tự lấy ảnh gốc từ máy chủ ở nước ngoài,
// thu nhỏ đúng kích thước cần + đổi sang WebP (poster còn ~5-15KB), rồi phát
// qua CDN toàn cầu -> tải dưới 1 giây. Ảnh cũng không còn đi vòng qua server
// Render (/img-proxy) nữa nên server nhẹ hơn hẳn. Nếu Photon lỗi, modern.js
// tự chuyển ảnh đó về /img-proxy như trước.
//
// Dùng trong template: ${@img.cdn(movie.imageUrl, 320)}
@Component("img")
public class ImageCdn {

    private static final String PHOTON = "https://i0.wp.com/";
    private static final String PROXY_PREFIX = "/img-proxy?url=";
    private static final String NGUONC_IMG_HOST = "img.nguonc.com/";

    public String cdn(String url, int width) {
        if (url == null || url.isBlank()) return null;
        String path;
        if (url.startsWith("https://")) {
            path = url.substring(8);
        } else if (url.startsWith("http://")) {
            path = url.substring(7);
        } else {
            return url;
        }
        // Ảnh NguonC: máy chủ img.nguonc.com chặn Photon (403) nhưng tải thẳng
        // về Việt Nam rất nhanh -> dùng nguyên link gốc
        if (path.startsWith(NGUONC_IMG_HOST)) return url;
        // Photon không nhận URL có sẵn query string của ảnh gốc
        int q = path.indexOf('?');
        if (q > -1) path = path.substring(0, q);
        return PHOTON + path + "?w=" + width;
    }

    // Ảnh đã lưu trong lịch sử xem / yêu thích có thể là link cũ dạng
    // "/img-proxy?url=..." -> đổi sang link CDN để cũng tải nhanh
    public String fromStored(String stored, int width) {
        if (stored == null || stored.isBlank()) return null;
        if (stored.startsWith(PROXY_PREFIX)) {
            String original = URLDecoder.decode(stored.substring(PROXY_PREFIX.length()), StandardCharsets.UTF_8);
            return cdn(original, width);
        }
        if (stored.startsWith(PHOTON)) return stored;
        return cdn(stored, width);
    }
}

package com.example.reelcry.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ImageCdnTest {

    private final ImageCdn img = new ImageCdn();

    @Test
    void cdn_urlTuyetDoi_doiSangPhoton() {
        assertEquals("https://i0.wp.com/phimimg.com/upload/vod/a.jpg?w=360",
                img.cdn("https://phimimg.com/upload/vod/a.jpg", 360));
    }

    @Test
    void cdn_boQueryCuaAnhGoc() {
        assertEquals("https://i0.wp.com/phimimg.com/a.webp?w=320",
                img.cdn("https://phimimg.com/a.webp?v=2", 320));
    }

    @Test
    void cdn_nullHoacRong_traVeNull() {
        assertNull(img.cdn(null, 320));
        assertNull(img.cdn(" ", 320));
    }

    @Test
    void fromStored_linkProxyCu_doiSangPhoton() {
        assertEquals("https://i0.wp.com/phimimg.com/upload/vod/a.jpg?w=360",
                img.fromStored("/img-proxy?url=https%3A%2F%2Fphimimg.com%2Fupload%2Fvod%2Fa.jpg", 360));
    }

    @Test
    void fromStored_daLaPhoton_giuNguyen() {
        String url = "https://i0.wp.com/phimimg.com/a.jpg?w=480";
        assertEquals(url, img.fromStored(url, 360));
    }
}

package com.example.reelcry.controller;

import com.example.reelcry.entity.Favorite;
import com.example.reelcry.repository.FavoriteRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {

    private final FavoriteRepository repo;

    public FavoriteController(FavoriteRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ResponseEntity<Void> add(@RequestBody Map<String, Object> body, Authentication authentication) {
        if (authentication == null)
            return ResponseEntity.status(401).build();

        String slug = (String) body.get("slug");
        if (slug == null || slug.isBlank())
            return ResponseEntity.badRequest().build();

        String username = authentication.getName();

        Favorite entry = repo.findByUsernameAndMovieSlug(username, slug).orElseGet(Favorite::new);
        entry.setUsername(username);
        entry.setMovieSlug(slug);
        entry.setMovieName((String) body.getOrDefault("name", ""));
        entry.setMovieImage((String) body.getOrDefault("image", ""));
        entry.setSource((String) body.getOrDefault("source", "ophim"));
        entry.setAddedAt(Instant.now());
        repo.save(entry);

        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{slug}")
    public ResponseEntity<Void> remove(@PathVariable String slug, Authentication authentication) {
        if (authentication == null)
            return ResponseEntity.status(401).build();
        repo.deleteByUsernameAndMovieSlug(authentication.getName(), slug);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(Authentication authentication) {
        if (authentication == null)
            return ResponseEntity.status(401).build();
        repo.deleteByUsername(authentication.getName());
        return ResponseEntity.ok().build();
    }

    // Xoá theo danh sách phim đã chọn (checklist trên giao diện), thay vì xoá
    // hết toàn bộ danh sách yêu thích một lượt.
    @PostMapping("/delete-selected")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Void> deleteSelected(@RequestBody Map<String, Object> body, Authentication authentication) {
        if (authentication == null)
            return ResponseEntity.status(401).build();

        Object slugsObj = body.get("slugs");
        if (!(slugsObj instanceof List)) {
            return ResponseEntity.badRequest().build();
        }

        List<String> slugs = (List<String>) slugsObj;
        if (slugs.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        repo.deleteByUsernameAndMovieSlugIn(authentication.getName(), slugs);
        return ResponseEntity.ok().build();
    }
}

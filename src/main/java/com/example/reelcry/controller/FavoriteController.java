package com.example.reelcry.controller;

import com.example.reelcry.entity.Favorite;
import com.example.reelcry.repository.FavoriteRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
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
}

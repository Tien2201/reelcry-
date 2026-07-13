package com.example.reelcry.controller;

import com.example.reelcry.entity.WatchHistory;
import com.example.reelcry.repository.WatchHistoryRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/history")
public class HistoryController {

    private final WatchHistoryRepository repo;

    public HistoryController(WatchHistoryRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ResponseEntity<Void> save(@RequestBody Map<String, String> body, Authentication authentication) {
        if (authentication == null) return ResponseEntity.status(401).build();

        String slug = body.get("slug");
        if (slug == null || slug.isBlank()) return ResponseEntity.badRequest().build();

        String username = authentication.getName();

        WatchHistory entry = repo.findByUsernameAndMovieSlug(username, slug).orElseGet(WatchHistory::new);
        entry.setUsername(username);
        entry.setMovieSlug(slug);
        entry.setMovieName(body.getOrDefault("name", ""));
        entry.setMovieImage(body.getOrDefault("image", ""));
        entry.setWatchedAt(Instant.now());
        repo.save(entry);

        return ResponseEntity.ok().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(Authentication authentication) {
        if (authentication == null) return ResponseEntity.status(401).build();
        repo.deleteByUsername(authentication.getName());
        return ResponseEntity.ok().build();
    }
}
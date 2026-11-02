# Training video index

`apps/web/public/training/videos.json` records the verified YouTube IDs, lesson objectives and chapter timestamps. The Help dialog imports this same manifest, so diagram-specific links and search use the course index's destinations. Videos remain unlisted on YouTube.

After production outputs are available locally, run:

```sh
python3 scripts/training/prepare-youtube.py
npx prettier --write --ignore-path /dev/null apps/web/public/training/index.html apps/web/public/training/training.css apps/web/public/training/videos.json
```

The generator preserves existing YouTube IDs. It prepares upload titles/descriptions under `output/youtube-upload/`, copies caption sidecars, packages learner practice files, and renders the static index. It does not upload or publish anything. Generated MP4s and production caches do not belong in Git.

The existing GitHub Pages build copies Vite's public directory into the deployed app, including `/training/`. Publishing that index or the Help links makes the unlisted URLs available to app visitors; unlisted is not access control. The index carries `noindex,nofollow` for this review edition.

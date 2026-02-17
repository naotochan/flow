"""
Download a faster-whisper model from Hugging Face with progress reporting.
Outputs JSON lines to stdout for progress tracking.
"""
import sys
import json
import os


def report(status, progress=0, message=""):
    print(json.dumps({"status": status, "progress": progress, "message": message}), flush=True)


def main():
    model_name = sys.argv[1] if len(sys.argv) > 1 else "base"
    repo_id = f"Systran/faster-whisper-{model_name}"

    report("downloading", 0, f"Starting download: {repo_id}")

    try:
        from huggingface_hub import snapshot_download, HfApi
        import threading
        import time

        # Get total size info
        api = HfApi()
        try:
            model_info = api.model_info(repo_id, files_metadata=True)
            siblings = model_info.siblings or []
            total_size = sum(s.size for s in siblings if s.size)
        except Exception:
            total_size = 0

        report("downloading", 2, "Fetching file list...")

        cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
        model_cache_dir = os.path.join(cache_dir, f"models--Systran--faster-whisper-{model_name}")
        blobs_dir = os.path.join(model_cache_dir, "blobs")

        # Measure pre-existing size in blobs dir (already cached files)
        def get_blobs_size():
            size = 0
            if os.path.exists(blobs_dir):
                for entry in os.scandir(blobs_dir):
                    if entry.is_file(follow_symlinks=False):
                        try:
                            size += entry.stat().st_size
                        except OSError:
                            pass
            return size

        base_size = get_blobs_size()

        done = threading.Event()
        error_holder = [None]

        def do_download():
            try:
                snapshot_download(
                    repo_id,
                    cache_dir=cache_dir,
                    local_files_only=False,
                )
                done.set()
            except Exception as e:
                error_holder[0] = e
                done.set()

        t = threading.Thread(target=do_download, daemon=True)
        t.start()

        # Poll progress by checking blob sizes
        pct = 2
        while not done.is_set():
            time.sleep(1)
            current_size = get_blobs_size() - base_size

            if total_size > 0:
                pct = max(pct, min(95, int(current_size / total_size * 100)))
                size_mb = current_size / (1024 * 1024)
                total_mb = total_size / (1024 * 1024)
                msg = f"{size_mb:.0f} / {total_mb:.0f} MB"
            else:
                # No total size info — increment slowly
                if current_size > 0:
                    pct = min(95, pct + 2)
                size_mb = current_size / (1024 * 1024)
                msg = f"{size_mb:.0f} MB downloaded"

            report("downloading", pct, msg)

        t.join()

        if error_holder[0]:
            raise error_holder[0]

        report("done", 100, "Download complete")

    except KeyboardInterrupt:
        report("cancelled", 0, "Download cancelled")
        sys.exit(1)
    except Exception as e:
        report("error", 0, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()

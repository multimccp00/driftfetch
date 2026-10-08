# Current 0.5.5

- One pasted image-gallery URL stays one Current download entry. Current sends its selected image URLs to a single batch worker instead of adding one queue row for every image.
- Images retain separate filenames inside the gallery's folder. The parent job reports the final saved image and remains the single History entry for that gallery link.

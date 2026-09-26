-- UP: rename sightings.upvote_count to vote_count
ALTER TABLE sightings RENAME COLUMN upvote_count TO vote_count;

-- Recreate trigger function with updated column name
CREATE OR REPLACE FUNCTION update_sighting_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE sightings SET vote_count = vote_count + 1 WHERE id = NEW.sighting_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE sightings SET vote_count = vote_count - 1 WHERE id = OLD.sighting_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- DOWN:
-- ALTER TABLE sightings RENAME COLUMN vote_count TO upvote_count;
--
-- CREATE OR REPLACE FUNCTION update_sighting_upvote_count()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     IF TG_OP = 'INSERT' THEN
--         UPDATE sightings SET upvote_count = upvote_count + 1 WHERE id = NEW.sighting_id;
--         RETURN NEW;
--     ELSIF TG_OP = 'DELETE' THEN
--         UPDATE sightings SET upvote_count = upvote_count - 1 WHERE id = OLD.sighting_id;
--         RETURN OLD;
--     END IF;
--     RETURN NULL;
-- END;
-- $$ LANGUAGE plpgsql;

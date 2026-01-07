use rusqlite::{Connection, Result};
use std::path::Path;
use crate::commands::{ProcessedURL, ScrapedURL, ProcessedStats, ScrapedStats};

pub fn init_database(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    
    // Create tables if they don't exist
    conn.execute_batch(
        "
        -- Processed URLs: URLs where signup was attempted
        CREATE TABLE IF NOT EXISTS processed_urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            source TEXT DEFAULT 'unknown',
            status TEXT NOT NULL,
            fields_filled TEXT,
            error_message TEXT,
            error_category TEXT,
            details TEXT,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Scraped URLs: URLs from Meta Ads (queue)
        CREATE TABLE IF NOT EXISTS scraped_urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            ad_id TEXT,
            advertiser TEXT,
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed INTEGER DEFAULT 0
        );
        
        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_processed_url ON processed_urls(url);
        CREATE INDEX IF NOT EXISTS idx_processed_status ON processed_urls(status);
        CREATE INDEX IF NOT EXISTS idx_scraped_url ON scraped_urls(url);
        CREATE INDEX IF NOT EXISTS idx_scraped_processed ON scraped_urls(processed);
        "
    )?;
    
    // Run migrations for existing databases - add new columns if they don't exist
    migrate_database(&conn)?;
    
    Ok(())
}

fn migrate_database(conn: &Connection) -> Result<()> {
    // Check if error_category column exists
    let has_error_category: bool = conn
        .prepare("SELECT error_category FROM processed_urls LIMIT 1")
        .is_ok();
    
    if !has_error_category {
        // Add error_category column
        conn.execute("ALTER TABLE processed_urls ADD COLUMN error_category TEXT", [])?;
    }
    
    // Check if details column exists
    let has_details: bool = conn
        .prepare("SELECT details FROM processed_urls LIMIT 1")
        .is_ok();
    
    if !has_details {
        // Add details column
        conn.execute("ALTER TABLE processed_urls ADD COLUMN details TEXT", [])?;
    }
    
    // Now create the index on error_category (only if column exists)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_processed_category ON processed_urls(error_category)",
        []
    )?;
    
    Ok(())
}

// ==================== PROCESSED URLs ====================

pub fn get_processed_urls(db_path: &str, limit: i32) -> Result<Vec<ProcessedURL>> {
    let conn = Connection::open(db_path)?;
    
    let mut stmt = conn.prepare(
        "SELECT id, url, source, status, fields_filled, error_message, error_category, details, processed_at 
         FROM processed_urls 
         ORDER BY processed_at DESC 
         LIMIT ?"
    )?;
    
    let rows = stmt.query_map([limit], |row| {
        Ok(ProcessedURL {
            id: row.get(0)?,
            url: row.get(1)?,
            source: row.get(2)?,
            status: row.get(3)?,
            fields_filled: row.get(4)?,
            error_message: row.get(5)?,
            error_category: row.get(6)?,
            details: row.get(7)?,
            processed_at: row.get(8)?,
        })
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn get_processed_stats(db_path: &str) -> Result<ProcessedStats> {
    let conn = Connection::open(db_path)?;
    
    let total: i32 = conn.query_row("SELECT COUNT(*) FROM processed_urls", [], |row| row.get(0))?;
    let successful: i32 = conn.query_row("SELECT COUNT(*) FROM processed_urls WHERE status = 'success'", [], |row| row.get(0))?;
    let failed: i32 = conn.query_row("SELECT COUNT(*) FROM processed_urls WHERE status = 'failed'", [], |row| row.get(0))?;
    let skipped: i32 = conn.query_row("SELECT COUNT(*) FROM processed_urls WHERE status = 'skipped'", [], |row| row.get(0))?;
    
    Ok(ProcessedStats { total, successful, failed, skipped })
}

pub fn delete_processed_url(db_path: &str, id: i32) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM processed_urls WHERE id = ?", [id])?;
    Ok(())
}

pub fn clear_processed_urls(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM processed_urls", [])?;
    Ok(())
}

pub fn export_processed_csv(db_path: &str) -> Result<String> {
    let conn = Connection::open(db_path)?;
    
    let mut stmt = conn.prepare(
        "SELECT id, url, source, status, processed_at FROM processed_urls ORDER BY processed_at DESC"
    )?;
    
    let mut csv = String::from("id,url,source,status,processed_at\n");
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    
    for row in rows {
        let (id, url, source, status, processed_at) = row?;
        let escaped_url = url.replace('"', "\"\"");
        csv.push_str(&format!("{},\"{}\",{},{},{}\n", id, escaped_url, source, status, processed_at));
    }
    
    Ok(csv)
}

// ==================== SCRAPED URLs ====================

pub fn get_scraped_urls(db_path: &str, limit: i32) -> Result<Vec<ScrapedURL>> {
    let conn = Connection::open(db_path)?;
    
    let mut stmt = conn.prepare(
        "SELECT id, url, ad_id, advertiser, scraped_at, processed 
         FROM scraped_urls 
         ORDER BY scraped_at DESC 
         LIMIT ?"
    )?;
    
    let rows = stmt.query_map([limit], |row| {
        Ok(ScrapedURL {
            id: row.get(0)?,
            url: row.get(1)?,
            ad_id: row.get(2)?,
            advertiser: row.get(3)?,
            scraped_at: row.get(4)?,
            processed: row.get::<_, i32>(5)? == 1,
        })
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn get_scraped_stats(db_path: &str) -> Result<ScrapedStats> {
    let conn = Connection::open(db_path)?;
    
    let total: i32 = conn.query_row("SELECT COUNT(*) FROM scraped_urls", [], |row| row.get(0))?;
    let processed: i32 = conn.query_row("SELECT COUNT(*) FROM scraped_urls WHERE processed = 1", [], |row| row.get(0))?;
    let pending: i32 = conn.query_row("SELECT COUNT(*) FROM scraped_urls WHERE processed = 0", [], |row| row.get(0))?;
    
    Ok(ScrapedStats { total, processed, pending })
}

pub fn delete_scraped_url(db_path: &str, id: i32) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM scraped_urls WHERE id = ?", [id])?;
    Ok(())
}

pub fn update_scraped_url_status(db_path: &str, id: i32, processed: bool) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "UPDATE scraped_urls SET processed = ? WHERE id = ?",
        [if processed { 1 } else { 0 }, id]
    )?;
    Ok(())
}

pub fn clear_scraped_urls(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM scraped_urls", [])?;
    Ok(())
}

pub fn export_scraped_csv(db_path: &str) -> Result<String> {
    let conn = Connection::open(db_path)?;
    
    let mut stmt = conn.prepare(
        "SELECT id, url, ad_id, advertiser, scraped_at, processed FROM scraped_urls ORDER BY scraped_at DESC"
    )?;
    
    let mut csv = String::from("id,url,ad_id,advertiser,scraped_at,processed\n");
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i32>(5)?,
        ))
    })?;
    
    for row in rows {
        let (id, url, ad_id, advertiser, scraped_at, processed) = row?;
        let escaped_url = url.replace('"', "\"\"");
        let ad = ad_id.unwrap_or_default();
        let adv = advertiser.unwrap_or_default().replace('"', "\"\"");
        csv.push_str(&format!("{},\"{}\",{},\"{}\",{},{}\n", id, escaped_url, ad, adv, scraped_at, processed));
    }
    
    Ok(csv)
}

// ==================== LEGACY COMPATIBILITY ====================
// Keep old function names working for existing code

pub fn is_url_processed(db_path: &str, url: &str) -> Result<bool> {
    let conn = Connection::open(db_path)?;
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM processed_urls WHERE url = ?",
        [url],
        |row| row.get(0)
    )?;
    Ok(count > 0)
}

// Legacy stats function - now returns processed stats
pub fn get_stats(db_path: &str) -> Result<ProcessedStats> {
    get_processed_stats(db_path)
}

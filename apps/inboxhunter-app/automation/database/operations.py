"""
Database operations for InboxHunter.
Two tables:
1. processed_urls - URLs that have been processed (signup attempted)
2. scraped_urls - URLs scraped from Meta Ads (queue for processing)
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import sessionmaker, declarative_base
from loguru import logger

Base = declarative_base()


class ProcessedURL(Base):
    """URLs that have been processed (signup attempted)."""
    __tablename__ = 'processed_urls'
    
    id = Column(Integer, primary_key=True)
    url = Column(String(2000), nullable=False, unique=True)
    source = Column(String(50), default='unknown')  # 'csv', 'meta', 'database'
    status = Column(String(20), nullable=False)  # 'success', 'failed', 'skipped'
    fields_filled = Column(Text)  # JSON array of fields that were filled
    error_message = Column(Text)  # Error details if failed / reason if skipped
    error_category = Column(String(50))  # Error category: validation, captcha, not_found, etc.
    details = Column(Text)  # Additional info: signup type, form found, etc.
    processed_at = Column(DateTime, default=datetime.utcnow)


class ScrapedURL(Base):
    """URLs scraped from Meta Ads library (queue for processing)."""
    __tablename__ = 'scraped_urls'

    id = Column(Integer, primary_key=True)
    url = Column(String(2000), nullable=False, unique=True)
    ad_id = Column(String(100))  # Meta Ad ID
    advertiser = Column(String(500))  # Advertiser name
    scraped_at = Column(DateTime, default=datetime.utcnow)
    processed = Column(Integer, default=0)  # 0 = not processed, 1 = processed


class ApiSession(Base):
    """API cost tracking per session."""
    __tablename__ = 'api_sessions'

    id = Column(Integer, primary_key=True)
    session_start = Column(DateTime, default=datetime.utcnow)
    model = Column(String(50), nullable=False)  # e.g., 'gpt-4o-mini'
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cost = Column(String(20), default='0.0')  # Store as string for precision
    api_calls = Column(Integer, default=0)


class DatabaseOperations:
    """Database operations for InboxHunter."""
    
    def __init__(self, db_url: str):
        self.engine = create_engine(db_url, echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        
        # Run migrations to add new columns to existing tables
        self._migrate_schema()
        
        logger.debug(f"Database initialized: {db_url}")
    
    def _migrate_schema(self):
        """Add missing columns to existing tables (for schema updates)."""
        from sqlalchemy import text, inspect
        
        inspector = inspect(self.engine)
        
        # Check processed_urls table for missing columns
        if 'processed_urls' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('processed_urls')]
            
            # Add 'details' column if missing
            if 'details' not in columns:
                logger.info("📦 Migrating database: Adding 'details' column to processed_urls...")
                with self.engine.connect() as conn:
                    conn.execute(text("ALTER TABLE processed_urls ADD COLUMN details TEXT"))
                    conn.commit()
                logger.info("✅ Database migration complete")
            
            # Add 'error_category' column if missing
            if 'error_category' not in columns:
                logger.info("📦 Migrating database: Adding 'error_category' column to processed_urls...")
                with self.engine.connect() as conn:
                    conn.execute(text("ALTER TABLE processed_urls ADD COLUMN error_category VARCHAR(50)"))
                    conn.commit()
                logger.info("✅ Database migration complete")
    
    # ==================== PROCESSED URLs ====================
    
    def is_url_processed(self, url: str) -> bool:
        """Check if URL has been processed."""
        session = self.Session()
        try:
            count = session.query(ProcessedURL).filter(ProcessedURL.url == url).count()
            return count > 0
        finally:
            session.close()
    
    def add_processed_url(self, url: str, source: str, status: str, 
                          fields_filled: List[str] = None, error_message: str = None,
                          error_category: str = None, details: str = None) -> int:
        """Add a processed URL record."""
        session = self.Session()
        try:
            # Check if already exists
            existing = session.query(ProcessedURL).filter(ProcessedURL.url == url).first()
            if existing:
                # Update existing record
                existing.status = status
                existing.fields_filled = json.dumps(fields_filled or [])
                existing.error_message = error_message
                existing.error_category = error_category
                existing.details = details
                existing.processed_at = datetime.utcnow()
                session.commit()
                return existing.id
            
            record = ProcessedURL(
                url=url,
                source=source,
                status=status,
                fields_filled=json.dumps(fields_filled or []),
                error_message=error_message,
                error_category=error_category,
                details=details
            )
            session.add(record)
            session.commit()
            return record.id
        finally:
            session.close()
    
    def get_processed_urls(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get processed URL records."""
        session = self.Session()
        try:
            records = session.query(ProcessedURL).order_by(
                ProcessedURL.processed_at.desc()
            ).limit(limit).all()
            
            return [{
                "id": r.id,
                "url": r.url,
                "source": r.source,
                "status": r.status,
                "fields_filled": json.loads(r.fields_filled) if r.fields_filled else [],
                "error_message": r.error_message,
                "error_category": r.error_category,
                "details": r.details,
                "processed_at": r.processed_at.isoformat() if r.processed_at else None
            } for r in records]
        finally:
            session.close()
    
    def get_processed_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        session = self.Session()
        try:
            total = session.query(ProcessedURL).count()
            successful = session.query(ProcessedURL).filter(ProcessedURL.status == 'success').count()
            failed = session.query(ProcessedURL).filter(ProcessedURL.status == 'failed').count()
            skipped = session.query(ProcessedURL).filter(ProcessedURL.status == 'skipped').count()
            
            return {
                "total": total,
                "successful": successful,
                "failed": failed,
                "skipped": skipped
            }
        finally:
            session.close()
    
    def delete_processed_url(self, record_id: int) -> bool:
        """Delete a processed URL record."""
        session = self.Session()
        try:
            record = session.query(ProcessedURL).filter(ProcessedURL.id == record_id).first()
            if record:
                session.delete(record)
                session.commit()
                return True
            return False
        finally:
            session.close()
    
    def clear_processed_urls(self):
        """Clear all processed URLs."""
        session = self.Session()
        try:
            session.query(ProcessedURL).delete()
            session.commit()
        finally:
            session.close()
    
    # ==================== SCRAPED URLs ====================
    
    def add_scraped_url(self, url: str, ad_id: str = None, advertiser: str = None) -> Optional[int]:
        """Add a scraped URL (no duplicates)."""
        session = self.Session()
        try:
            # Check if already exists
            existing = session.query(ScrapedURL).filter(ScrapedURL.url == url).first()
            if existing:
                return None  # Already exists, skip
            
            record = ScrapedURL(
                url=url,
                ad_id=ad_id,
                advertiser=advertiser
            )
            session.add(record)
            session.commit()
            return record.id
        except Exception as e:
            session.rollback()
            logger.debug(f"Skipping duplicate URL: {url}")
            return None
        finally:
            session.close()
    
    def add_scraped_urls_batch(self, urls: List[Dict[str, str]]) -> int:
        """Add multiple scraped URLs, skipping duplicates. Returns count of new URLs added."""
        session = self.Session()
        added = 0
        try:
            for url_data in urls:
                url = url_data.get('url')
                if not url:
                    continue
                    
                existing = session.query(ScrapedURL).filter(ScrapedURL.url == url).first()
                if not existing:
                    record = ScrapedURL(
                        url=url,
                        ad_id=url_data.get('ad_id'),
                        advertiser=url_data.get('advertiser')
                    )
                    session.add(record)
                    added += 1
            
            session.commit()
            return added
        except Exception as e:
            session.rollback()
            logger.error(f"Error adding batch URLs: {e}")
            return 0
        finally:
            session.close()
    
    def get_scraped_urls(self, limit: int = 100, unprocessed_only: bool = False) -> List[Dict[str, Any]]:
        """Get scraped URL records."""
        session = self.Session()
        try:
            query = session.query(ScrapedURL)
            if unprocessed_only:
                query = query.filter(ScrapedURL.processed == 0)
            records = query.order_by(ScrapedURL.scraped_at.desc()).limit(limit).all()
            
            return [{
                "id": r.id,
                "url": r.url,
                "ad_id": r.ad_id,
                "advertiser": r.advertiser,
                "scraped_at": r.scraped_at.isoformat() if r.scraped_at else None,
                "processed": r.processed == 1
            } for r in records]
        finally:
            session.close()
    
    def get_unprocessed_urls(self, limit: int = 100) -> List[str]:
        """Get unprocessed scraped URLs for the bot to process."""
        session = self.Session()
        try:
            records = session.query(ScrapedURL).filter(
                ScrapedURL.processed == 0
            ).order_by(ScrapedURL.scraped_at.asc()).limit(limit).all()
            return [r.url for r in records]
        finally:
            session.close()
    
    def mark_url_processed(self, url: str):
        """Mark a scraped URL as processed."""
        session = self.Session()
        try:
            record = session.query(ScrapedURL).filter(ScrapedURL.url == url).first()
            if record:
                record.processed = 1
                session.commit()
        finally:
            session.close()
    
    def get_scraped_stats(self) -> Dict[str, int]:
        """Get scraped URL statistics."""
        session = self.Session()
        try:
            total = session.query(ScrapedURL).count()
            processed = session.query(ScrapedURL).filter(ScrapedURL.processed == 1).count()
            pending = session.query(ScrapedURL).filter(ScrapedURL.processed == 0).count()
            
            return {
                "total": total,
                "processed": processed,
                "pending": pending
            }
        finally:
            session.close()
    
    def delete_scraped_url(self, record_id: int) -> bool:
        """Delete a scraped URL record."""
        session = self.Session()
        try:
            record = session.query(ScrapedURL).filter(ScrapedURL.id == record_id).first()
            if record:
                session.delete(record)
                session.commit()
                return True
            return False
        finally:
            session.close()
    
    def clear_scraped_urls(self):
        """Clear all scraped URLs."""
        session = self.Session()
        try:
            session.query(ScrapedURL).delete()
            session.commit()
        finally:
            session.close()
    
    # ==================== LEGACY COMPATIBILITY ====================
    # These methods maintain compatibility with existing code
    
    def add_signup(self, url: str, source: str, status: str, fields_filled: List[str] = None) -> int:
        """Legacy method - redirects to add_processed_url."""
        return self.add_processed_url(url, source, status, fields_filled)
    
    def add_error(self, url: str, source: str, error_type: str, error_message: str = "") -> int:
        """Legacy method - now just logs, as errors are tracked in processed_urls."""
        logger.debug(f"Error recorded for {url}: {error_type} - {error_message}")
        return 0

    # ==================== API COST TRACKING ====================

    def save_api_session_costs(self, cost_data: Dict[str, Any]) -> int:
        """Save API costs from a session. Returns number of records added."""
        session = self.Session()
        added = 0
        try:
            session_time = datetime.utcnow()
            by_model = cost_data.get('by_model', {})

            for model, stats in by_model.items():
                record = ApiSession(
                    session_start=session_time,
                    model=model,
                    input_tokens=stats.get('input_tokens', 0),
                    output_tokens=stats.get('output_tokens', 0),
                    cost=str(stats.get('cost', 0.0)),
                    api_calls=stats.get('calls', 0)
                )
                session.add(record)
                added += 1

            session.commit()
            return added
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving API session costs: {e}")
            return 0
        finally:
            session.close()

    def get_api_cost_summary(self) -> Dict[str, Any]:
        """Get cumulative API cost summary across all sessions."""
        session = self.Session()
        try:
            from sqlalchemy import func

            # Get totals by model
            results = session.query(
                ApiSession.model,
                func.sum(ApiSession.input_tokens).label('input_tokens'),
                func.sum(ApiSession.output_tokens).label('output_tokens'),
                func.sum(ApiSession.api_calls).label('api_calls')
            ).group_by(ApiSession.model).all()

            by_model = {}
            total_cost = 0.0
            total_calls = 0
            total_tokens = 0

            for row in results:
                # Sum costs (stored as strings)
                model_costs = session.query(ApiSession.cost).filter(
                    ApiSession.model == row.model
                ).all()
                model_cost = sum(float(c[0]) for c in model_costs)

                by_model[row.model] = {
                    'input_tokens': row.input_tokens or 0,
                    'output_tokens': row.output_tokens or 0,
                    'total_tokens': (row.input_tokens or 0) + (row.output_tokens or 0),
                    'api_calls': row.api_calls or 0,
                    'cost': round(model_cost, 4)
                }
                total_cost += model_cost
                total_calls += row.api_calls or 0
                total_tokens += (row.input_tokens or 0) + (row.output_tokens or 0)

            # Get session count
            session_count = session.query(
                func.count(func.distinct(ApiSession.session_start))
            ).scalar() or 0

            return {
                'by_model': by_model,
                'total_cost': round(total_cost, 4),
                'total_calls': total_calls,
                'total_tokens': total_tokens,
                'session_count': session_count
            }
        finally:
            session.close()

    def get_api_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent API session records."""
        session = self.Session()
        try:
            records = session.query(ApiSession).order_by(
                ApiSession.session_start.desc()
            ).limit(limit).all()

            return [{
                'id': r.id,
                'session_start': r.session_start.isoformat() if r.session_start else None,
                'model': r.model,
                'input_tokens': r.input_tokens,
                'output_tokens': r.output_tokens,
                'cost': float(r.cost) if r.cost else 0.0,
                'api_calls': r.api_calls
            } for r in records]
        finally:
            session.close()

    def clear_api_sessions(self):
        """Clear all API session records."""
        session = self.Session()
        try:
            session.query(ApiSession).delete()
            session.commit()
        finally:
            session.close()

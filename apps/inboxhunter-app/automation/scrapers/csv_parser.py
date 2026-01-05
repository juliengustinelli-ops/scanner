"""
CSV Parser for loading URLs from CSV files.
Only requires a 'url' column - all other columns are optional and ignored.
"""

import csv
from pathlib import Path
from typing import List, Dict, Any
from loguru import logger


class CSVParser:
    """
    Parse URLs from CSV files.
    Only the 'url' column is required.
    """
    
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
    
    def parse(self) -> List[Dict[str, Any]]:
        """
        Parse CSV file and extract URLs.
        
        The CSV only needs a 'url' column (or similar: link, landing_page, website).
        All other columns are ignored.
        
        Returns:
            List of URL dictionaries with 'url' and 'source' keys
        """
        urls = []
        
        if not self.csv_path.exists():
            logger.error(f"CSV file not found: {self.csv_path}")
            return urls
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Find URL column (flexible naming)
                fieldnames = reader.fieldnames or []
                url_column = None
                
                for col in fieldnames:
                    if col.lower() in ['url', 'link', 'landing_page', 'website']:
                        url_column = col
                        break
                
                if not url_column:
                    logger.error(f"No URL column found in CSV. Looking for: url, link, landing_page, or website")
                    logger.error(f"Available columns: {fieldnames}")
                    return urls
                
                for row in reader:
                    url = row.get(url_column, "").strip()
                    if url and url.startswith("http"):
                        urls.append({
                            "url": url,
                            "source": "csv"
                        })
                
            logger.info(f"✅ Parsed {len(urls)} URLs from CSV")
            
        except Exception as e:
            logger.error(f"Error parsing CSV: {e}")
        
        return urls


"""Database configuration for Python data loaders (mirror of db.js)."""

CONNECTION_STRING = (
    "Driver={ODBC Driver 17 for SQL Server};"
    "Server=.;"
    "Database=tufman2;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
    "ApplicationIntent=ReadOnly;"
)

# Earliest date included in all analyses (inclusive).
ANALYSIS_START_DATE = "2017-01-01"

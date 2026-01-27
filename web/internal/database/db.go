package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Database 数据库连接封装
type Database struct {
	db *sql.DB
}

// New 创建新的数据库连接
func New(dbPath string) (*Database, error) {
	// 确保数据目录存在
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// 打开数据库连接
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// 设置连接池参数
	// SQLite在WAL模式下同一时间只能有一个写入者,设置为1避免锁冲突
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	// 启用WAL模式以提高并发性能
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to set WAL mode: %w", err)
	}

	// 设置忙碌超时时间(5秒)
	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	// 设置同步模式为NORMAL以平衡性能和安全性
	if _, err := db.Exec("PRAGMA synchronous=NORMAL"); err != nil {
		return nil, fmt.Errorf("failed to set synchronous mode: %w", err)
	}

	// 启用外键约束
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	return &Database{db: db}, nil
}

// Migrate 运行数据库迁移
func (d *Database) Migrate() error {
	files := []string{
		"migrations/001_init.sql",
		"migrations/002_add_probe_coordinates.sql",
		"migrations/003_add_result_status.sql",
	}

	if err := d.ensureMigrationTable(); err != nil {
		return err
	}

	for _, file := range files {
		applied, err := d.isMigrationApplied(file)
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		migrationSQL, err := os.ReadFile(file)
		if err != nil {
			// 允许从仓库根目录运行：尝试 web/migrations/...
			migrationSQL, err = os.ReadFile(filepath.Join("web", file))
			if err != nil {
				return fmt.Errorf("failed to read migration file %s: %w", file, err)
			}
		}

		tx, err := d.db.Begin()
		if err != nil {
			return fmt.Errorf("failed to start migration transaction %s: %w", file, err)
		}

		if _, err := tx.Exec(string(migrationSQL)); err != nil {
			// 兼容旧数据库：在未记录 schema_migrations 的情况下，ALTER TABLE 可能已执行过
			if (file == "migrations/002_add_probe_coordinates.sql" || file == "migrations/003_add_result_status.sql") && isSQLiteDuplicateColumnError(err) {
				if err := d.markMigrationApplied(tx, file); err != nil {
					_ = tx.Rollback()
					return err
				}
				if err := tx.Commit(); err != nil {
					return fmt.Errorf("failed to commit migration %s: %w", file, err)
				}
				continue
			}

			_ = tx.Rollback()
			return fmt.Errorf("failed to execute migration %s: %w", file, err)
		}
		if err := d.markMigrationApplied(tx, file); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", file, err)
		}
	}

	return nil
}

func (d *Database) ensureMigrationTable() error {
	_, err := d.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		filename TEXT PRIMARY KEY,
		applied_at DATETIME NOT NULL
	)`)
	if err != nil {
		return fmt.Errorf("failed to ensure schema_migrations table: %w", err)
	}
	return nil
}

func isSQLiteDuplicateColumnError(err error) bool {
	if err == nil {
		return false
	}
	// modernc sqlite 错误字符串常见形态："SQL logic error: duplicate column name: ..."
	return strings.Contains(err.Error(), "duplicate column name")
}

func (d *Database) isMigrationApplied(filename string) (bool, error) {
	var count int
	err := d.db.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE filename = ?`, filename).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to query schema_migrations for %s: %w", filename, err)
	}
	return count > 0, nil
}

func (d *Database) markMigrationApplied(tx *sql.Tx, filename string) error {
	_, err := tx.Exec(`INSERT OR REPLACE INTO schema_migrations (filename, applied_at) VALUES (?, ?)`, filename, time.Now())
	if err != nil {
		return fmt.Errorf("failed to mark migration applied %s: %w", filename, err)
	}
	return nil
}

// Close 关闭数据库连接
func (d *Database) Close() error {
	return d.db.Close()
}

// DB 返回底层数据库连接
func (d *Database) DB() *sql.DB {
	return d.db
}

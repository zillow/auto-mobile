package dev.jasonpearson.automobile.storage.session

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class SessionDatabase(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(CREATE_SESSIONS_TABLE)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS sessions")
        onCreate(db)
    }

    companion object {
        private const val DATABASE_NAME = "sessions.db"
        private const val DATABASE_VERSION = 1

        private const val CREATE_SESSIONS_TABLE =
            """
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                app_version TEXT,
                device_model TEXT,
                os_version TEXT
            )
            """
    }
}

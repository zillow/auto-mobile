package dev.jasonpearson.automobile.storage.session

import android.content.ContentValues
import android.content.Context
import android.os.Build
import java.util.UUID

class SessionRepository(private val context: Context) {

    private val database = SessionDatabase(context)

    fun recordSessionStart() {
        val appVersion =
            try {
                context.packageManager.getPackageInfo(context.packageName, 0).versionName
            } catch (e: Exception) {
                null
            }

        val values =
            ContentValues().apply {
                put("session_id", UUID.randomUUID().toString())
                put("started_at", System.currentTimeMillis())
                put("app_version", appVersion)
                put("device_model", Build.MODEL)
                put("os_version", Build.VERSION.RELEASE)
            }

        database.writableDatabase.insert("sessions", null, values)
    }
}

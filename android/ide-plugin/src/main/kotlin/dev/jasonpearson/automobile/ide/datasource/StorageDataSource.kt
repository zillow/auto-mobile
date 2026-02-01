package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueFile

interface StorageDataSource {
    suspend fun getDatabases(): Result<List<DatabaseInfo>>
    suspend fun getKeyValueFiles(): Result<List<KeyValueFile>>
}

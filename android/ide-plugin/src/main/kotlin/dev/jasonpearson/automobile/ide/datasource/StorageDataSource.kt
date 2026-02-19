package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType

interface StorageDataSource {
    suspend fun getDatabases(): Result<List<DatabaseInfo>>
    suspend fun getKeyValueFiles(): Result<List<KeyValueFile>>
    suspend fun setKeyValue(fileName: String, key: String, value: String?, type: KeyValueType): Result<Unit>
    suspend fun removeKeyValue(fileName: String, key: String): Result<Unit>
    suspend fun clearKeyValueFile(fileName: String): Result<Unit>
}

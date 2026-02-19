package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.StorageMockData
import kotlinx.coroutines.delay

/**
 * Fake storage data source returning mock data for UI development.
 */
class FakeStorageDataSource : StorageDataSource {
    override suspend fun getDatabases(): Result<List<DatabaseInfo>> {
        // Simulate network delay
        delay(100)

        return Result.Success(StorageMockData.databases)
    }

    override suspend fun getKeyValueFiles(): Result<List<KeyValueFile>> {
        // Simulate network delay
        delay(100)

        return Result.Success(StorageMockData.keyValueFiles)
    }

    override suspend fun setKeyValue(
        fileName: String,
        key: String,
        value: String?,
        type: KeyValueType,
    ): Result<Unit> {
        delay(100)
        return Result.Success(Unit)
    }

    override suspend fun removeKeyValue(fileName: String, key: String): Result<Unit> {
        delay(100)
        return Result.Success(Unit)
    }

    override suspend fun clearKeyValueFile(fileName: String): Result<Unit> {
        delay(100)
        return Result.Success(Unit)
    }
}

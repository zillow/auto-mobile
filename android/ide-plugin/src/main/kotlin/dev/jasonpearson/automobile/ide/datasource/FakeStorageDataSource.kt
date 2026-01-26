package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.storage.StorageMockData
import kotlinx.coroutines.delay

/**
 * Fake storage data source returning mock data for UI development.
 */
class FakeStorageDataSource : StorageDataSource {
    override suspend fun getDatabases(): Result<List<dev.jasonpearson.automobile.ide.storage.DatabaseInfo>> {
        // Simulate network delay
        delay(100)

        return Result.Success(StorageMockData.databases)
    }

    override suspend fun getKeyValuePairs(): Result<List<dev.jasonpearson.automobile.ide.storage.KeyValueEntry>> {
        // Simulate network delay
        delay(100)

        // Flatten all key-value entries from all files
        val allEntries = StorageMockData.keyValueFiles.flatMap { it.entries }

        return Result.Success(allEntries)
    }
}

package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.storage.DatabaseInfo
import dev.jasonpearson.automobile.ide.storage.KeyValueFile
import dev.jasonpearson.automobile.ide.storage.KeyValueType
import dev.jasonpearson.automobile.ide.storage.QueryResult
import dev.jasonpearson.automobile.ide.storage.StorageMockData
import kotlinx.coroutines.delay

/**
 * Fake storage data source returning mock data for UI development.
 */
class FakeStorageDataSource : StorageDataSource {
    override suspend fun getDatabases(): Result<List<DatabaseInfo>> {
        delay(100)
        return Result.Success(StorageMockData.databases)
    }

    override suspend fun getKeyValueFiles(): Result<List<KeyValueFile>> {
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

    override suspend fun getTableData(
        databasePath: String,
        table: String,
        limit: Int,
        offset: Int,
    ): Result<QueryResult> {
        delay(100)
        return Result.Success(StorageMockData.mockQueryResult)
    }

    override suspend fun executeSQL(databasePath: String, query: String): Result<QueryResult> {
        delay(150)
        return Result.Success(StorageMockData.mockQueryResult)
    }
}

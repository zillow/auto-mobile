package dev.jasonpearson.automobile.ide.datasource

/**
 * Real storage data source that fetches from MCP resources.
 */
class RealStorageDataSource : StorageDataSource {
    override suspend fun getDatabases(): Result<List<dev.jasonpearson.automobile.ide.storage.DatabaseInfo>> {
        // TODO: Implement MCP resource fetch for databases
        // This should call MCP to list databases on the connected device
        // For now, return empty list as placeholder

        return Result.Success(emptyList())
    }

    override suspend fun getKeyValuePairs(): Result<List<dev.jasonpearson.automobile.ide.storage.KeyValueEntry>> {
        // TODO: Implement MCP resource fetch for key-value pairs
        // This should call MCP to get SharedPreferences/UserDefaults from the connected device
        // For now, return empty list as placeholder

        return Result.Success(emptyList())
    }
}

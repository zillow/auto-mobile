package dev.jasonpearson.automobile.ide.navigation

data class ScreenNode(
    val id: String,
    val name: String,
    val type: String, // Activity, Fragment, Composable
    val packageName: String,
    val transitionCount: Int,
    val discoveredAt: Long, // epoch millis - older = discovered earlier during exploration
    val screenshotUri: String? = null, // MCP resource URI for screenshot thumbnail
)

data class ScreenTransition(
    val id: String,
    val fromScreen: String,
    val toScreen: String,
    val trigger: String, // "tap", "intent", "back", "swipe"
    val element: String?, // UI element that triggers
    val avgLatencyMs: Int,
    val failureRate: Float,
    val traversalCount: Int = 1, // Number of times this transition has been traversed
)

// Mock data for development - Messaging app (18 screens)
// Timestamps simulate AutoMobile exploring the app starting from Splash
object NavigationMockData {
    private const val BASE_TIME = 1705000000000L // Jan 11, 2024

    val screens = listOf(
        // Discovery order: Splash → Login → Signup → Home → ChatList → Chat → Profile → Settings
        ScreenNode("splash", "Splash", "Activity", "com.chat.app", 2, BASE_TIME),
        ScreenNode("login", "Login", "Composable", "com.chat.auth", 3, BASE_TIME + 2_000),
        ScreenNode("signup", "Signup", "Composable", "com.chat.auth", 2, BASE_TIME + 4_000),
        ScreenNode("home", "Home", "Composable", "com.chat.main", 5, BASE_TIME + 6_000),
        ScreenNode("chats", "ChatList", "Composable", "com.chat.main", 2, BASE_TIME + 8_000),
        ScreenNode("chat", "Chat", "Composable", "com.chat.main", 2, BASE_TIME + 10_000),
        ScreenNode("profile", "Profile", "Composable", "com.chat.user", 2, BASE_TIME + 12_000),
        ScreenNode("settings", "Settings", "Composable", "com.chat.user", 1, BASE_TIME + 14_000),
        // Additional screens
        ScreenNode("contacts", "Contacts", "Composable", "com.chat.contacts", 3, BASE_TIME + 16_000),
        ScreenNode("newchat", "NewChat", "Composable", "com.chat.main", 2, BASE_TIME + 18_000),
        ScreenNode("groupchat", "GroupChat", "Composable", "com.chat.main", 3, BASE_TIME + 20_000),
        ScreenNode("media", "MediaGallery", "Composable", "com.chat.media", 2, BASE_TIME + 22_000),
        ScreenNode("call", "VoiceCall", "Activity", "com.chat.calls", 2, BASE_TIME + 24_000),
        ScreenNode("videocall", "VideoCall", "Activity", "com.chat.calls", 2, BASE_TIME + 26_000),
        ScreenNode("notifications", "Notifications", "Composable", "com.chat.settings", 1, BASE_TIME + 28_000),
        ScreenNode("search", "Search", "Composable", "com.chat.main", 2, BASE_TIME + 30_000),
        ScreenNode("editprofile", "EditProfile", "Composable", "com.chat.user", 1, BASE_TIME + 32_000),
        ScreenNode("privacy", "Privacy", "Composable", "com.chat.settings", 1, BASE_TIME + 34_000),
    )

    val transitions = listOf(
        // Splash → Auth or Home
        ScreenTransition("t01", "Splash", "Login", "intent", null, 150, 0.01f),
        ScreenTransition("t02", "Splash", "Signup", "intent", null, 150, 0.01f),
        ScreenTransition("t03a", "Splash", "Home", "intent", null, 120, 0.0f),

        // Auth flow - Login/Signup can connect to each other and Home
        ScreenTransition("t03", "Login", "Signup", "tap", "Create Account", 80, 0.0f),
        ScreenTransition("t04", "Login", "Home", "tap", "Login", 350, 0.03f),
        ScreenTransition("t05", "Signup", "Home", "tap", "Sign Up", 280, 0.02f),
        ScreenTransition("t06", "Signup", "Login", "back", null, 40, 0.0f),

        // Home → tabs and features
        ScreenTransition("t10", "Home", "ChatList", "tap", "Chats Tab", 50, 0.0f),
        ScreenTransition("t11", "Home", "Profile", "tap", "Profile Tab", 50, 0.0f),
        ScreenTransition("t12", "Home", "Settings", "tap", "Settings Tab", 50, 0.0f),
        ScreenTransition("t13", "Home", "Contacts", "tap", "Contacts Tab", 50, 0.0f),
        ScreenTransition("t14", "Home", "Search", "tap", "Search Icon", 40, 0.0f),

        // ChatList → Chat detail and NewChat
        ScreenTransition("t20", "ChatList", "Chat", "tap", "Conversation", 90, 0.01f),
        ScreenTransition("t21", "Chat", "ChatList", "back", null, 45, 0.0f),
        ScreenTransition("t22", "ChatList", "NewChat", "tap", "FAB", 60, 0.0f),
        ScreenTransition("t23", "ChatList", "Search", "tap", "Search", 40, 0.0f),

        // NewChat flows
        ScreenTransition("t30", "NewChat", "Chat", "tap", "Contact", 80, 0.0f),
        ScreenTransition("t31", "NewChat", "GroupChat", "tap", "New Group", 70, 0.0f),
        ScreenTransition("t32", "NewChat", "Contacts", "tap", "Add Contact", 50, 0.0f),

        // Chat features
        ScreenTransition("t40", "Chat", "MediaGallery", "tap", "Media Button", 100, 0.02f),
        ScreenTransition("t41", "Chat", "VoiceCall", "tap", "Call Button", 200, 0.05f),
        ScreenTransition("t42", "Chat", "VideoCall", "tap", "Video Button", 250, 0.08f),
        ScreenTransition("t43", "Chat", "Profile", "tap", "Contact Avatar", 60, 0.0f),

        // GroupChat features
        ScreenTransition("t50", "GroupChat", "MediaGallery", "tap", "Media Button", 100, 0.02f),
        ScreenTransition("t51", "GroupChat", "VoiceCall", "tap", "Call Button", 220, 0.06f),

        // Contacts
        ScreenTransition("t60", "Contacts", "Chat", "tap", "Contact", 80, 0.01f),
        ScreenTransition("t61", "Contacts", "NewChat", "tap", "Message Icon", 50, 0.0f),

        // Profile
        ScreenTransition("t70", "Profile", "EditProfile", "tap", "Edit Button", 60, 0.0f),
        ScreenTransition("t71", "Profile", "Settings", "tap", "Settings Icon", 50, 0.0f),

        // Settings
        ScreenTransition("t80", "Settings", "Notifications", "tap", "Notifications", 50, 0.0f),
        ScreenTransition("t81", "Settings", "Privacy", "tap", "Privacy", 50, 0.0f),
        ScreenTransition("t82", "Settings", "EditProfile", "tap", "Account", 60, 0.0f),

        // Search results
        ScreenTransition("t90", "Search", "Chat", "tap", "Result", 70, 0.01f),
        ScreenTransition("t91", "Search", "Contacts", "tap", "Contact Result", 60, 0.0f),
    )
}

# Pocketcasts App Navigation Structure

Based on exploring the Pocketcasts podcast app on Android, here's a comprehensive navigation diagram showing the app's structure and features:

```mermaid
graph TB
    %% Main Navigation Structure
    App[Pocketcasts App]
    
    %% Bottom Navigation Tabs
    App --> BN[Bottom Navigation Bar]
    BN --> Podcasts[Podcasts Tab]
    BN --> Filters[Filters Tab]
    BN --> Discover[Discover Tab]
    BN --> UpNext[Up Next Tab]
    BN --> Profile[Profile Tab]
    
    %% Mini Player (persistent across all tabs)
    App --> MiniPlayer[Mini Player Bar]
    MiniPlayer --> MPControls[Player Controls]
    MPControls --> SkipBack[Skip Back Button]
    MPControls --> PlayPause[Play/Pause Button]
    MPControls --> SkipForward[Skip Forward Button]
    MiniPlayer --> ProgressBar[Progress Bar]
    MiniPlayer --> UpNextCount[Up Next Count Badge]
    MiniPlayer --> FullPlayer[Full Player View<br/>on tap]
    
    %% Podcasts Tab Structure
    Podcasts --> PToolbar[Podcasts Toolbar]
    PToolbar --> CreateFolder[Create Folder Button]
    PToolbar --> CastButton[Cast Button]
    PToolbar --> SearchPodcasts[Search Podcasts Button]
    PToolbar --> MoreOptions[More Options Menu]
    
    Podcasts --> PodcastGrid[Podcast Grid View]
    PodcastGrid --> Folders[Podcast Folders]
    Folders --> CodingFolder[Coding Folder<br/>4 podcasts]
    Folders --> LeadershipFolder[Leadership Folder<br/>4 podcasts]
    Folders --> AIFolder[AI Folder<br/>4 podcasts]
    Folders --> InactiveFolder[Inactive Folder<br/>4 podcasts]
    
    %% Filters Tab Structure
    Filters --> FToolbar[Filters Toolbar]
    FToolbar --> BackButton[Back Button]
    FToolbar --> FilterOptions[Filter Options Button]
    FToolbar --> FCast[Cast Button]
    FToolbar --> FMoreOptions[More Options]
    
    Filters --> FiltersList[Episode List]
    FiltersList --> NewReleases[New Releases Filter]
    NewReleases --> EpisodeRows[Episode Rows]
    EpisodeRows --> EpisodeDetails[Episode Details]
    EpisodeDetails --> EDate[Date]
    EpisodeDetails --> ETitle[Title]
    EpisodeDetails --> EDuration[Duration/Status]
    EpisodeDetails --> EPlayButton[Play Button]
    
    %% Discover Tab Structure
    Discover --> DSearch[Search Bar]
    DSearch --> SearchInput[Search podcasts or add RSS URL]
    
    Discover --> Categories[Category Pills]
    Categories --> AllCategories[All Categories]
    Categories --> TrueCrime[True Crime]
    Categories --> Comedy[Comedy]
    Categories --> SocietyCulture[Society & Culture]
    
    Discover --> FeaturedCarousel[Featured Podcasts Carousel]
    FeaturedCarousel --> PodcastCard[Podcast Cards]
    PodcastCard --> PCTitle[Podcast Title]
    PodcastCard --> PCAuthor[Author/Network]
    PodcastCard --> FollowButton[Follow Button]
    
    Discover --> TrendingSection[Trending Section]
    TrendingSection --> ShowAll[Show All Button]
    TrendingSection --> TrendingList[Trending Podcast List]
    
    Discover --> Sponsored[Sponsored Podcast]
    
    %% Up Next Tab Structure
    UpNext --> UNHeader[Up Next Header]
    UNHeader --> CloseButton[Close Button]
    UNHeader --> ClearQueue[Clear Queue Button]
    UNHeader --> SelectButton[Select Button]
    
    UpNext --> CurrentEpisode[Currently Playing Episode]
    CurrentEpisode --> CEInfo[Episode Info]
    
    UpNext --> QueueList[Episode Queue]
    QueueList --> QueueItem[Queue Items]
    QueueItem --> QIDate[Date]
    QueueItem --> QITitle[Title]
    QueueItem --> QITimeLeft[Time Left]
    QueueItem --> ReorderHandle[Reorder Handle]
    
    UpNext --> QueueFooter[Queue Footer]
    QueueFooter --> TotalTime[Total Time - 140h 20m]
    QueueFooter --> ShuffleButton[Shuffle Button]
    QueueFooter --> EpisodeCount[206 episodes]
    
    %% Profile Tab Structure
    Profile --> ProfileHeader[Profile Header]
    ProfileHeader --> GiftButton[Gift Button]
    ProfileHeader --> SettingsButton[Settings Button]
    
    Profile --> AccountSection[Account Section]
    AccountSection --> Email[jason.d.pearson@gmail.com]
    AccountSection --> AccountButton[Account Button]
    
    Profile --> StatsSection[User Stats]
    StatsSection --> PodcastCount[23 Podcasts]
    StatsSection --> DaysListened[6 Days Listened]
    StatsSection --> MinutesSaved[52 Minutes Saved]
    
    Profile --> ProfileMenu[Profile Menu Items]
    ProfileMenu --> Stats[Stats]
    ProfileMenu --> Downloads[Downloads]
    ProfileMenu --> Files[Files]
    ProfileMenu --> Starred[Starred]
    ProfileMenu --> Bookmarks[Bookmarks]
    ProfileMenu --> ListeningHistory[Listening History]
    ProfileMenu --> HelpFeedback[Help & Feedback]
    
    %% Episode Detail View (Modal)
    App --> EpisodeModal[Episode Detail Modal]
    EpisodeModal --> EDTabs[Detail Tabs]
    EDTabs --> DetailsTab[Details Tab]
    EDTabs --> BookmarksTab[Bookmarks Tab]
    
    EpisodeModal --> EActions[Episode Actions]
    EActions --> StarButton[Star/Unstar Button]
    EActions --> ShareButton[Share Button]
    
    EpisodeModal --> EContent[Episode Content]
    EContent --> EpisodeTitle[Episode Title]
    EContent --> PodcastName[Podcast Name]
    EContent --> PlayControls[Play Controls]
    EContent --> ActionButtons[Action Buttons]
    ActionButtons --> DownloadBtn[Download - 48 MB]
    ActionButtons --> AddUpNextBtn[Add to Up Next]
    ActionButtons --> MarkPlayedBtn[Mark Played]
    ActionButtons --> ArchiveBtn[Archive]
    
    EContent --> EpisodeProgress[Episode Progress Bar]
    EContent --> TimeInfo[Time Info]
    TimeInfo --> PublishDate[Publish Date]
    TimeInfo --> TimeRemaining[Time Remaining]
    
    EContent --> TranscriptSection[Transcript Section]
    TranscriptSection --> ViewTranscript[View Transcript Button]
    TranscriptSection --> TranscriptContent[Episode Description & Transcript]
    
    %% Styling
    classDef navigation fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef content fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef action fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef persistent fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    
    class BN,Podcasts,Filters,Discover,UpNext,Profile navigation
    class PodcastGrid,FiltersList,FeaturedCarousel,TrendingSection,QueueList,ProfileMenu content
    class CreateFolder,SearchPodcasts,PlayPause,FollowButton,ClearQueue,ShuffleButton action
    class MiniPlayer,MPControls persistent
```

## Key Features and Navigation Patterns

### 1. **Bottom Navigation Bar (Persistent)**
   - Always visible at the bottom of the screen
   - 5 main tabs: Podcasts, Filters, Discover, Up Next, Profile
   - Selected tab is highlighted

### 2. **Mini Player (Persistent)**
   - Appears above the bottom navigation when content is playing
   - Shows currently playing episode with basic controls
   - Displays "Up Next" count badge (206 in this case)
   - Tap to expand to full player view

### 3. **Podcasts Tab**
   - Grid layout showing podcast folders/collections
   - Folders are organized by category (Coding, Leadership, AI, Inactive)
   - Each folder shows 4 podcast artwork thumbnails
   - Toolbar includes create folder, cast, search, and more options

### 4. **Filters Tab**
   - Shows filtered episode lists (e.g., "New Releases")
   - Episode rows display date, title, duration, and play button
   - Downloaded episodes marked with special indicator
   - Can tap filter options to change filter criteria

### 5. **Discover Tab**
   - Search bar for finding new podcasts or adding RSS feeds
   - Category pills for browsing by genre
   - Featured podcast carousel with follow buttons
   - Trending podcasts section with "Show All" option
   - Sponsored podcast recommendations

### 6. **Up Next Tab**
   - Queue management interface
   - Shows currently playing episode at top
   - List of queued episodes with reorder handles
   - Queue statistics (total time, episode count)
   - Clear queue and shuffle options

### 7. **Profile Tab**
   - User account information and settings access
   - Listening statistics dashboard
   - Quick access to Downloads, Files, Starred, Bookmarks
   - Listening History tracking
   - Help & Feedback section

### 8. **Episode Detail Modal**
   - Opens when tapping on an episode
   - Tabs for Details and Bookmarks
   - Full episode description and transcript
   - Download, play, archive, and sharing options
   - Progress bar and time information

## User Flow Examples

1. **Playing a Podcast**: Podcasts Tab → Select Folder → Choose Podcast → Episode List → Play Episode
2. **Discovering New Content**: Discover Tab → Browse Categories/Search → Follow Podcast
3. **Managing Queue**: Up Next Tab → Reorder/Remove Episodes → Shuffle/Clear Options
4. **Accessing Downloads**: Profile Tab → Downloads → View Downloaded Episodes

This structure provides a comprehensive podcast listening experience with easy navigation between discovery, library management, and playback functions.

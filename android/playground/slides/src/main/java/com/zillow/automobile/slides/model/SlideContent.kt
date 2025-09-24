package com.zillow.automobile.slides.model

/**
 * Sealed class representing different types of slide content. Each slide type has its own data
 * requirements and rendering approach.
 */
sealed class SlideContent {
  /**
   * Large text slide with optional subtitle. Auto-resizes text to fill available space effectively.
   */
  data class LargeText(val title: String, val subtitle: String? = null) : SlideContent()

  /**
   * Bulleted list slide with hierarchical support. Each bullet point can contain nested sub-points.
   */
  data class BulletPoints(val title: String? = null, val points: List<BulletPoint>) :
      SlideContent()

  /**
   * Emoji slide with large emoji display and optional caption. Uses predefined emoji set for
   * consistency.
   */
  data class Emoji(val emoji: PresentationEmoji, val caption: String? = null) : SlideContent()

  /**
   * Code sample slide with syntax highlighting. Supports multiple programming languages and copy
   * functionality.
   */
  data class CodeSample(
      val code: String,
      val language: String,
      val title: String? = null,
      val highlight: String? = null
  ) : SlideContent()

  /**
   * Image/visualization slide with optional caption. Supports both local and remote images with
   * loading states.
   */
  data class Visualization(
      val imageUrl: String,
      val caption: String? = null,
      val contentDescription: String? = null
  ) : SlideContent()

  /**
   * Video player slide with controls and caption. Auto-pauses when navigating away from the slide.
   */
  data class Video(
      val videoUrl: String,
      val caption: String? = null,
      val contentDescription: String? = null
  ) : SlideContent()

  /**
   * Mermaid diagram slide with interactive diagrams. Renders Mermaid syntax into SVG diagrams with
   * theming support.
   */
  data class MermaidDiagram(
      val code: String,
      val title: String,
  ) : SlideContent()

  /**
   * Screenshot slide with day/night theme support. Automatically selects appropriate screenshot
   * based on current theme.
   */
  data class Screenshot(
      val lightScreenshot: Int? = null,
      val darkScreenshot: Int? = null,
      val title: String? = null,
      val caption: String? = null,
      val contentDescription: String? = null
  ) : SlideContent()
}

/** Represents a bullet point that can have nested sub-points. */
data class BulletPoint(val text: String, val subPoints: List<String> = emptyList())

/**
 * Predefined emojis commonly used in presentations. Ensures consistency and provides type safety.
 */
enum class PresentationEmoji(val unicode: String, val description: String) {
  CONSTRUCTION("🚧", "Under Construction"),
  THINKING("🤔", "Thinking"),
  ROCKET("🚀", "Launch/Fast"),
  LIGHTBULB("💡", "Idea"),
  CHECKMARK("✅", "Success/Done"),
  WARNING("⚠️", "Warning"),
  FIRE("🔥", "Hot/Popular"),
  THUMBS_UP("👍", "Approval"),
  GEAR("⚙️", "Settings/Configuration"),
  CHART("📊", "Analytics/Data"),
  PHONE("📱", "Mobile"),
  COMPUTER("💻", "Desktop/Development"),
  EYES("👀", "Attention/Looking"),
  PARTY("🎉", "Celebration"),
  TARGET("🎯", "Goal/Target"),
  MAGNIFYING_GLASS("🔍", "Search/Investigate"),
  TOOLBOX("🧰", "Tools/Resources"),
  BOOK("📖", "Documentation/Learning"),
  GIFT("🎁", "Gift/Surprise"),
  CLOCK("⏰", "Time/Deadline"),
  HOME("🏠", "Home/Base"),
  STOPWATCH("⏱️", "Timer/Efficiency"),
  PICTURE("🖼️", "Image/Visual"),
  DOLPHIN("🐬", "Dolphin/Flipper"),
  TASK("📋", "Task/To-Do"),
  ADOPTION("🐾", "Adoption/Pet"),
  TRY("🤞", "Try/Attempt"),
  EASY("🍰", "Easy"),
  PROGRAMMER("👨‍💻", "Programmer/Developer"),
  SHRUG("🤷", "Shrug/Uncertainty"),
  MICROPHONE("🎤", "Microphone/Presentation"),
  CAMERA("📷", "Camera/Capture"),
  PENCIL("✏️", "Edit/Write"),
  LOCK("🔒", "Security/Private"),
  GLOBE("🌍", "Global/Worldwide"),
  MONEY("💰", "Money/Finance"),
  HEART("❤️", "Love/Support"),
  STAR("⭐", "Star/Favorite"),
  TROPHY("🏆", "Trophy/Win"),
  BELL("🔔", "Notification"),
  CALENDAR("📅", "Calendar/Schedule"),
  MAIL("📧", "Email/Message"),
  CHAT("💬", "Chat/Conversation"),
  FOLDER("📁", "Folder/Directory"),
  SLOW("🐌", "Slow"),
  FAST("⚡", "Fast"),
  TEAM("👥", "Team/Collaboration"),
  INDIVIDUAL("🧑", "Individual/Person"),
  QUESTION("❓", "Question"),
  EXCLAMATION("❗", "Exclamation"),
  PLUS("➕", "Add/Include"),
  MINUS("➖", "Remove/Exclude"),
  LAPTOP("💻", "Laptop/Portable"),
  WINDOWS("🪟", "Windows/Glass"),
  VOMIT("🤮", "Vomit/Disgust"),
  LINK("🔗", "Link/Connection"),
  LOOP("🔁", "Loop/Repeat"),
  MOVIE("🎬", "Movie/Video"),
  BROKEN_CHAIN("⛓\uFE0F\u200D\uD83D\uDCA5", "Broken Link/Disconnected"),
  ACCESSIBILITY("♿", "Accessibility/Inclusive"),
  INCLUSIVE("🌈", "Inclusive/Diverse"),
  SECURE("🔐", "Secure/Safe"),
  ENGINE("⚙️", "Engine/Mechanism"),
  TOOLS("🛠️", "Tools/Equipment"),
  RUST("🦀", "Rust/Programming"),
  NEW_EMPLOYEE("👋", "New Employee/Welcome"),
  DATA_TRANSFER("📡", "Data Transfer/Restore")
}

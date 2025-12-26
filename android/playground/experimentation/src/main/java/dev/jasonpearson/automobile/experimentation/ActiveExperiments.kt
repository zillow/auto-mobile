package dev.jasonpearson.automobile.experimentation

import dev.jasonpearson.automobile.experimentation.experiments.MoodExperiment

enum class ActiveExperiments(val experimentName: String) {
  Mood(MoodExperiment.EXPERIMENT_NAME)
}

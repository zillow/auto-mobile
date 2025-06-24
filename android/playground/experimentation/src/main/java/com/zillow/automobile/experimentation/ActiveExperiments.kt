package com.zillow.automobile.experimentation

import com.zillow.automobile.experimentation.experiments.MoodExperiment
import com.zillow.automobile.experimentation.experiments.MoodTreatment

enum class ActiveExperiments(val experimentName: String) {
  Mood(MoodExperiment.EXPERIMENT_NAME)
}

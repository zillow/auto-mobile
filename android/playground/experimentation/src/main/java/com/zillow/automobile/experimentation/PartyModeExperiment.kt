package com.zillow.automobile.experimentation

class PartyModeExperiment(private val experimentRepository: ExperimentRepository) {
  enum class Treatment {
    CONTROL,
    PARTY
  }

  companion object {
    const val EXPERIMENT_NAME = "Mood"
    const val CONTROL_TREATMENT = "Control"
    const val PARTY_TREATMENT = "Party"
  }

  fun getCurrentTreatment(): Treatment {
    val experiments = experimentRepository.getExperiments()
    val moodExperiment = experiments.find { it.name == EXPERIMENT_NAME }

    return when (moodExperiment?.currentTreatment) {
      PARTY_TREATMENT -> Treatment.PARTY
      else -> Treatment.CONTROL
    }
  }

  fun isPartyModeEnabled(): Boolean {
    return getCurrentTreatment() == Treatment.PARTY
  }
}

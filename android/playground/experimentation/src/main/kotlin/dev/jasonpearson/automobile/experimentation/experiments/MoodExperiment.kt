package dev.jasonpearson.automobile.experimentation.experiments

import dev.jasonpearson.automobile.experimentation.Experiment
import dev.jasonpearson.automobile.experimentation.Treatment

enum class MoodTreatment(override val id: String, override val label: String) : Treatment {
  CONTROL("Control", "Control"),
  PARTY("Party", "Party");

  override fun getControl(): MoodTreatment {
    return PARTY
  }

  companion object {
    fun getIdSet(): Set<MoodTreatment> {
      return entries.toSet()
    }
  }
}

class MoodExperiment(override val currentTreatment: MoodTreatment) : Experiment<MoodTreatment> {

  companion object {
    const val EXPERIMENT_NAME = "Mood"
    val treatments: Set<MoodTreatment> = MoodTreatment.getIdSet()
    val control: MoodExperiment = MoodExperiment(MoodTreatment.CONTROL)
  }

  override val name: String = EXPERIMENT_NAME
  override val treatments: Set<MoodTreatment> = MoodTreatment.getIdSet()

  override fun copy(treatment: Treatment): Experiment<MoodTreatment> {
    return when (treatment) {
      is MoodTreatment -> return MoodExperiment(treatment)
      else -> this
    }
  }
}

package com.zillow.automobile.experimentation

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.zillow.automobile.experimentation.experiments.MoodExperiment
import com.zillow.automobile.experimentation.experiments.MoodTreatment

class ExperimentRepository(context: Context) {

  private val sharedPreferences: SharedPreferences =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun getExperiments(): List<Experiment<*>> {
    return getActiveExperiments().mapNotNull { experiment ->
      when (experiment) {
        ActiveExperiments.Mood -> {
          val currentTreatmentId = getExperimentCurrentTreatmentId(experiment.experimentName)
          val currentTreatment =
              MoodExperiment.treatments.find { it.id == currentTreatmentId }
                  ?: MoodTreatment.CONTROL
          MoodExperiment(currentTreatment)
        }
        else -> {
          null
        }
      }
    }
  }

  internal fun getExperimentCurrentTreatmentId(experimentName: String): String {
    return sharedPreferences.getString("${KEY_CURRENT_TREATMENT_PREFIX}$experimentName", CONTROL)
        ?: CONTROL
  }

  fun getActiveExperiments(): Set<ActiveExperiments> {
    return ActiveExperiments.entries.toSet()
  }

  fun <T : Treatment> saveExperiment(experiment: Experiment<T>) {
    val experimentNames =
        sharedPreferences.getStringSet(KEY_EXPERIMENT_NAMES, emptySet())?.toMutableSet()
            ?: mutableSetOf()
    experimentNames.add(experiment.name)

    sharedPreferences.edit {
      putStringSet(KEY_EXPERIMENT_NAMES, experimentNames)
      putString("${KEY_CURRENT_TREATMENT_PREFIX}${experiment.name}", experiment.currentTreatment.id)
    }
  }

  fun <T : Treatment> updateExperimentTreatment(experiment: Experiment<T>, treatment: Treatment) {
    sharedPreferences.edit {
      putString("${KEY_CURRENT_TREATMENT_PREFIX}${experiment.name}", treatment.id)
    }
  }

  companion object {
    const val CONTROL = "control"
    private const val PREFS_NAME = "experiment_prefs"
    private const val KEY_EXPERIMENT_NAMES = "experiment_names"
    private const val KEY_CURRENT_TREATMENT_PREFIX = "current_treatment_"
  }
}

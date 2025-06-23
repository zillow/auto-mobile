package com.zillow.automobile.experimentation

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

class ExperimentRepository(context: Context) {
  private val sharedPreferences: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun getExperiments(): List<Experiment> {
    val experimentNames =
      sharedPreferences.getStringSet(KEY_EXPERIMENT_NAMES, emptySet()) ?: emptySet()
    return experimentNames.map { name ->
      val treatments =
        sharedPreferences.getStringSet("${KEY_TREATMENTS_PREFIX}$name", emptySet())?.toList()
          ?: emptyList()
      val currentTreatment = sharedPreferences.getString(
        "${KEY_CURRENT_TREATMENT_PREFIX}$name",
        treatments.firstOrNull()
      ) ?: ""
      Experiment(name, treatments, currentTreatment)
    }
  }

  fun saveExperiment(experiment: Experiment) {
    val experimentNames =
      sharedPreferences.getStringSet(KEY_EXPERIMENT_NAMES, emptySet())?.toMutableSet()
        ?: mutableSetOf()
    experimentNames.add(experiment.name)

    sharedPreferences.edit {
      putStringSet(KEY_EXPERIMENT_NAMES, experimentNames)
      putStringSet("${KEY_TREATMENTS_PREFIX}${experiment.name}", experiment.treatments.toSet())
      putString("${KEY_CURRENT_TREATMENT_PREFIX}${experiment.name}", experiment.currentTreatment)
    }
  }

  fun updateExperimentTreatment(experimentName: String, treatment: String) {
    sharedPreferences.edit {
      putString("${KEY_CURRENT_TREATMENT_PREFIX}$experimentName", treatment)
    }
  }

  fun deleteExperiment(experimentName: String) {
    val experimentNames =
      sharedPreferences.getStringSet(KEY_EXPERIMENT_NAMES, emptySet())?.toMutableSet()
        ?: mutableSetOf()
    experimentNames.remove(experimentName)

    sharedPreferences.edit {
      putStringSet(KEY_EXPERIMENT_NAMES, experimentNames)
      remove("${KEY_TREATMENTS_PREFIX}$experimentName")
      remove("${KEY_CURRENT_TREATMENT_PREFIX}$experimentName")
    }
  }

  fun clearAllExperiments() {
    val experimentNames = getExperiments().map { it.name }
    sharedPreferences.edit {
      experimentNames.forEach { name ->
        remove("${KEY_TREATMENTS_PREFIX}$name")
        remove("${KEY_CURRENT_TREATMENT_PREFIX}$name")
      }
      remove(KEY_EXPERIMENT_NAMES)
    }
  }

  companion object {
    private const val PREFS_NAME = "experiment_prefs"
    private const val KEY_EXPERIMENT_NAMES = "experiment_names"
    private const val KEY_TREATMENTS_PREFIX = "treatments_"
    private const val KEY_CURRENT_TREATMENT_PREFIX = "current_treatment_"
  }
}

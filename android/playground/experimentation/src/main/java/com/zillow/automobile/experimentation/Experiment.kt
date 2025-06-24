package com.zillow.automobile.experimentation

interface Experiment<T : Treatment> {
  val name: String
  val treatments: Set<T>
  val currentTreatment: T

  fun copy(treatment: Treatment): Experiment<T>
}

package com.zillow.automobile.experimentation

interface Treatment {
  val id: String
  val label: String

  fun getControl(): Treatment
}

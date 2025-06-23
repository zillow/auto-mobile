package com.zillow.automobile.experimentation

class ExperimentResolver(
    private val experimentRepository: ExperimentRepository
) {
    private val partyModeExperiment = PartyModeExperiment(experimentRepository)

    fun resolvePartyMode(): PartyModeExperiment.Treatment {
        return partyModeExperiment.getCurrentTreatment()
    }

    fun isPartyModeEnabled(): Boolean {
        return partyModeExperiment.isPartyModeEnabled()
    }
}

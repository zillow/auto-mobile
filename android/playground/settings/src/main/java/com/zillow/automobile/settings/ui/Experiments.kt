package com.zillow.automobile.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Science
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zillow.automobile.experimentation.Experiment

@Composable
fun ExperimentBottomSheetContent(
  experiment: Experiment,
  onTreatmentSelected: (String) -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp)
  ) {
    Text(
      text = "Select Treatment for ${experiment.name}",
      fontSize = 20.sp,
      fontWeight = FontWeight.Bold,
      modifier = Modifier.padding(bottom = 16.dp)
    )

    experiment.treatments.forEach { treatment ->
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .clickable { onTreatmentSelected(treatment) }
          .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        RadioButton(
          selected = treatment == experiment.currentTreatment,
          onClick = { onTreatmentSelected(treatment) }
        )
        Text(
          text = treatment,
          modifier = Modifier.padding(start = 8.dp)
        )
      }
    }

    Spacer(modifier = Modifier.height(16.dp))
  }
}

@Composable
fun ExperimentsCard(
  experiments: List<Experiment>,
  onExperimentClicked: (Experiment) -> Unit
) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
    shape = RoundedCornerShape(12.dp)
  ) {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Icon(
          imageVector = Icons.Filled.Science,
          contentDescription = "Experiments",
          modifier = Modifier.padding(end = 8.dp),
          tint = MaterialTheme.colorScheme.primary
        )
        Text(
          text = "Experiments",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurface
        )
      }

      experiments.forEach { experiment ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clickable {
              onExperimentClicked(experiment)
            }
            .padding(vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = experiment.name,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium
          )
          Text(
            text = "Current: ${experiment.currentTreatment}",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 12.dp)
          )
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExperimentsSection(
  experiments: List<Experiment>,
  onExperimentsUpdated: (List<Experiment>) -> Unit
) {
  var showBottomSheet by remember { mutableStateOf(false) }
  var selectedExperiment by remember { mutableStateOf<Experiment?>(null) }
  val sheetState = rememberModalBottomSheetState()

  ExperimentsCard(
    experiments = experiments,
    onExperimentClicked = { experiment ->
      selectedExperiment = experiment
      showBottomSheet = true
    }
  )

  // Bottom Sheet for Experiments
  if (showBottomSheet && selectedExperiment != null) {
    ModalBottomSheet(
      onDismissRequest = { showBottomSheet = false },
      sheetState = sheetState
    ) {
      ExperimentBottomSheetContent(
        experiment = selectedExperiment!!,
        onTreatmentSelected = { treatment ->
          val updatedExperiments = experiments.map { exp ->
            if (exp.name == selectedExperiment!!.name) {
              exp.copy(currentTreatment = treatment)
            } else exp
          }
          onExperimentsUpdated(updatedExperiments)
          showBottomSheet = false
        }
      )
    }
  }
}

@Preview(showBackground = true)
@Composable
fun ExperimentBottomSheetPreview() {
  MaterialTheme {
    ExperimentBottomSheetContent(
      experiment = Experiment(
        name = "Mood",
        treatments = listOf("Control", "Party"),
        currentTreatment = "Control"
      ),
      onTreatmentSelected = { /* Preview treatment selection */ }
    )
  }
}

@Preview(showBackground = true)
@Composable
fun ExperimentsCardPreview() {
  MaterialTheme {
    ExperimentsCard(
      experiments = listOf(
        Experiment("Mood", listOf("Control", "Party"), "Control")
      ),
      onExperimentClicked = { /* Preview click */ }
    )
  }
}

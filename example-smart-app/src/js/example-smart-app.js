(function (window) {
  window.extractData = function () {
    var ret = $.Deferred();

    function onError() {
      console.log("Loading error", arguments);
      ret.reject();
    }

    function onReady(smart) {
      if (smart.hasOwnProperty("patient")) {
        var patient = smart.patient;
        var pt = patient.read();
        var obv = smart.patient.api.fetchAll({
          type: "Observation",
          query: {
            code: {
              $or: [
                "http://loinc.org|8302-2", // Height
                "http://loinc.org|8462-4", // Diastolic BP
                "http://loinc.org|8480-6", // Systolic BP
                "http://loinc.org|2085-9", // HDL
                "http://loinc.org|2089-1", // LDL
                "http://loinc.org|55284-4", // Blood Pressure Panel
              ],
            },
          },
        });

        // Fetching MedicationRequest with patient parameter
        $.when(pt).done(function (patient) {
          var meds = smart.patient.api.fetchAll({
            type: "MedicationRequest",
            query: {
              patient: patient.id, // Use patient ID to filter MedicationRequest
            },
          });

          $.when(pt, obv, meds).fail(onError);

          $.when(pt, obv, meds).done(function (patient, obv, meds) {
            var byCodes = smart.byCodes(obv, "code");
            var gender = patient.gender;

            var fname = "";
            var lname = "";
            var patientId = "";

            if (typeof patient.name[0] !== "undefined") {
              fname = patient.name[0].given.join(" ");
              lname = patient.name[0].family;
              patientId = patient.id;
            }

            var height = byCodes("8302-2");
            var systolicbp = getBloodPressureValue(
              byCodes("55284-4"),
              "8480-6"
            );
            var diastolicbp = getBloodPressureValue(
              byCodes("55284-4"),
              "8462-4"
            );
            var hdl = byCodes("2085-9");
            var ldl = byCodes("2089-1");

            // Get additional observation data
            var observations = obv.map(function (obs) {
              return {
                id: obs.id,
                status: obs.status,
                category: obs.category?.map((cat) => cat.text).join(", ") || "N/A",
                code: obs.code?.text || "Unknown",
                result: obs.valueQuantity
                  ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit}`
                  : "No value",
                effectiveDate: obs.effectiveDateTime || "N/A",
              };
            });

            var p = defaultPatient();
            p.birthdate = patient.birthDate;
            p.gender = gender;
            p.fname = fname;
            p.lname = lname;
            p.patientId = patientId;
            p.height = getQuantityValueAndUnit(height[0]);

            if (typeof systolicbp != "undefined") {
              p.systolicbp = systolicbp;
            }

            if (typeof diastolicbp != "undefined") {
              p.diastolicbp = diastolicbp;
            }

            p.hdl = getQuantityValueAndUnit(hdl[0]);
            p.ldl = getQuantityValueAndUnit(ldl[0]);

            // Process Medications
            p.medications = meds.map(function (med) {
              return {
                medication: med.medicationCodeableConcept?.text || "Unknown",
                dosage: med.dosageInstruction?.[0]?.text || "No dosage information",
                status: med.status || "Unknown",
                authoredOn: med.authoredOn || "Unknown",
              };
            });

            // Add observations
            p.observations = observations;

            ret.resolve(p);
          });
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();
  };

  function defaultPatient() {
    return {
      fname: { value: "" },
      lname: { value: "" },
      gender: { value: "" },
      birthdate: { value: "" },
      height: { value: "" },
      systolicbp: { value: "" },
      diastolicbp: { value: "" },
      ldl: { value: "" },
      hdl: { value: "" },
      patientId: { value: "" },
      medications: [],
      observations: [],
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function (observation) {
      var BP = observation.component.find(function (component) {
        return component.code.coding.find(function (coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (
      typeof ob != "undefined" &&
      typeof ob.valueQuantity != "undefined" &&
      typeof ob.valueQuantity.value != "undefined" &&
      typeof ob.valueQuantity.unit != "undefined"
    ) {
      return ob.valueQuantity.value + " " + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function (p) {
    $("#holder").show();
    $("#loading").hide();
    $("#patientId").html(p.patientId);
    $("#fname").html(p.fname);
    $("#lname").html(p.lname);
    $("#gender").html(p.gender);
    $("#birthdate").html(p.birthdate);
    $("#height").html(p.height);
    $("#systolicbp").html(p.systolicbp);
    $("#diastolicbp").html(p.diastolicbp);
    $("#ldl").html(p.ldl);
    $("#hdl").html(p.hdl);

    // Display medications
    var medsHtml = p.medications
      .map(function (med) {
        return `
          <tr>
            <td>${med.medication}</td>
            <td>${med.dosage}</td>
            <td>${med.status}</td>
            <td>${med.authoredOn}</td>
          </tr>
        `;
      })
      .join("");
    $("#medications").html(medsHtml);

    // Display observations
    var obsHtml = p.observations
      .map(function (obs) {
        return `
          <tr>
            <td>${obs.id}</td>
            <td>${obs.status}</td>
            <td>${obs.category}</td>
            <td>${obs.code}</td>
            <td>${obs.result}</td>
            <td>${obs.effectiveDate}</td>
          </tr>
        `;
      })
      .join("");
    $("#observations").html(obsHtml);
  };
})(window);

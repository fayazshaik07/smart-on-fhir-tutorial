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

        // Fetching Condition and MedicationRequest
        $.when(pt).done(function (patient) {
          var meds = smart.patient.api.fetchAll({
            type: "MedicationRequest",
            query: {
              patient: patient.id, // Use patient ID to filter MedicationRequest
            },
          });

          var conditions = smart.patient.api.fetchAll({
            type: "Condition",
            query: {
              patient: patient.id, // Use patient ID to filter Condition
            },
          });

          $.when(pt, obv, meds, conditions).fail(onError);

          $.when(pt, obv, meds, conditions).done(function (
            patient,
            obv,
            meds,
            conditions
          ) {
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

            // Get Observations
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

            // Get Conditions
            var conditionHistory = conditions.map(function (cond) {
              return {
                id: cond.id,
                category:
                  cond.category?.map((cat) => cat.text).join(", ") || "Unknown",
                code: cond.code?.text || "Unknown",
                verificationStatus: cond.verificationStatus?.text || "Unknown",
                recordedDate: cond.recordedDate || "N/A",
                recorder: cond.recorder?.display || "Unknown",
              };
            });

            // Process Medications - Remove duplicates
            const seenMeds = new Map();
            var medications = meds
              .map(function (med) {
                return {
                  medication: med.medicationCodeableConcept?.text || "Unknown",
                  dosage:
                    med.dosageInstruction?.[0]?.text || "No dosage information",
                  status: med.status || "Unknown",
                  authoredOn: med.authoredOn || "Unknown",
                };
              })
              .filter((med) => {
                const key = `${med.medication}-${med.dosage}-${med.status}`;
                if (seenMeds.has(key)) {
                  return false;
                }
                seenMeds.set(key, true);
                return true;
              });

            var p = defaultPatient();
            p.birthdate = patient.birthDate;
            p.gender = gender;
            p.fname = fname;
            p.lname = lname;
            p.patientId = patientId;
            p.height = getQuantityValueAndUnit(height[0]);
            p.systolicbp = systolicbp || "N/A";
            p.diastolicbp = diastolicbp || "N/A";
            p.hdl = getQuantityValueAndUnit(hdl[0]) || "N/A";
            p.ldl = getQuantityValueAndUnit(ldl[0]) || "N/A";
            p.observations = observations;
            p.conditions = conditionHistory;
            p.medications = medications;

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
      fname: "",
      lname: "",
      gender: "",
      birthdate: "",
      height: "",
      systolicbp: "",
      diastolicbp: "",
      ldl: "",
      hdl: "",
      patientId: "",
      medications: [],
      observations: [],
      conditions: [],
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

    // Populate Patient Info
    $("#patientInfo").html(`
      <tr><td>Patient ID</td><td>${p.patientId}</td></tr>
      <tr><td>First Name</td><td>${p.fname}</td></tr>
      <tr><td>Last Name</td><td>${p.lname}</td></tr>
      <tr><td>Gender</td><td>${p.gender}</td></tr>
      <tr><td>Date of Birth</td><td>${p.birthdate}</td></tr>
    `);

    // Populate Observations
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

    // Populate Conditions
    var condHtml = p.conditions
      .map(function (cond) {
        return `
          <tr>
            <td>${cond.id}</td>
            <td>${cond.category}</td>
            <td>${cond.code}</td>
            <td>${cond.verificationStatus}</td>
            <td>${cond.recordedDate}</td>
            <td>${cond.recorder}</td>
          </tr>
        `;
      })
      .join("");
    $("#conditions").html(condHtml);

    // Populate Medications
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
  };
})(window);

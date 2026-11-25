// Getting to a shift: start and end points, leave-by times and map links.
import { describe, expect, it } from "vitest"
import { destinationOf, hhmm, journeyMins, leaveBy, mapLinks, originOf, tripKey, tripsToWorkOut } from "../trip"
import { newData, type Shift } from "../model"

function setup() {
  const d = newData("T")
  d.profile.homePostcode = "LS1 4AP"
  d.clients = [{ id: "c1", name: "Riverside Pharmacy", contact: "", email: "", phone: "", address: "4 Quay Road\nYork YO1 7HH", notes: "", created: "" }]
  const s: Shift = { id: "s1", date: "2030-03-04", start: "09:00", end: "17:00", breakMins: 30, clientId: "c1", pay: "hourly", rate: 25, notes: "", created: "" }
  d.shifts.push(s)
  return { d, s }
}

describe("Getting to a shift", () => {
  it("goes from home to the pharmacy's postcode", () => {
    const { d, s } = setup()
    expect(originOf(d, s)).toBe("LS1 4AP")
    expect(destinationOf(d, s).query).toBe("YO1 7HH")
    expect(originOf(d, { ...s, from: "M1 1AE" })).toBe("M1 1AE")
  })
  it("leave-by: journey time plus arriving early, rounded down to 5 minutes", () => {
    const { s } = setup()
    expect(hhmm(leaveBy(s, 37, 10))).toBe("08:10") // 09:00 − 47 min = 08:13 → 08:10
    expect(hhmm(leaveBy(s, 25, 5))).toBe("08:30")
  })
  it("uses the driving estimate only while it matches the route; typed minutes win; public transport needs typed minutes", () => {
    const { d, s } = setup()
    const key = tripKey("LS1 4AP", "YO1 7HH")
    expect(journeyMins(d, { ...s, trip: { key, mins: 42 } })).toBe(42)
    expect(journeyMins(d, { ...s, from: "M1 1AE", trip: { key, mins: 42 } })).toBeNull()
    expect(journeyMins(d, { ...s, travelMins: 55, trip: { key, mins: 42 } })).toBe(55)
    expect(journeyMins(d, { ...s, travel: "transit", trip: { key, mins: 42 } })).toBeNull()
    expect(journeyMins(d, { ...s, travel: "transit", travelMins: 70 })).toBe(70)
  })
  it("map links open driving or public transport directions", () => {
    const { d, s } = setup()
    const car = mapLinks(d, s)
    expect(car.google).toContain("origin=LS1%204AP")
    expect(car.google).toContain("travelmode=driving")
    expect(car.waze).toContain("navigate=yes")
    const bus = mapLinks(d, { ...s, travel: "transit" })
    expect(bus.google).toContain("travelmode=transit")
    expect(bus.apple).toContain("dirflg=r")
    expect(bus.waze).toBeNull()
  })
  it("only works out upcoming driving shifts that need it", () => {
    const { d } = setup()
    const now = new Date("2030-03-01T12:00:00")
    expect(tripsToWorkOut(d, now).map((x) => x.id)).toEqual(["s1"])
    d.shifts[0].trip = { key: tripKey("LS1 4AP", "YO1 7HH"), mins: 40 }
    expect(tripsToWorkOut(d, now)).toEqual([])
  })
})

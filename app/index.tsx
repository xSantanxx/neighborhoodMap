import {Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View} from "react-native";
import MapView, {Geojson, PROVIDER_DEFAULT, PROVIDER_GOOGLE} from "react-native-maps";
import {useEffect, useMemo, useRef, useState} from "react";
import nycNeighborhoods from "../neigh.json";
import * as turf from '@turf/turf';
import {BlurView} from 'expo-blur';
import {neighborhoodInfo} from "@/app/neighborhoodInfo";
import {generateNeighborhoodDescription} from "@/app/service";
import * as Location from "expo-location";
import {LocationAccuracy} from "expo-location";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isExpoGo = Constants.appOwnership === "expo";
import * as Notifications from "expo-notifications";
import {Stack} from "expo-router";
import * as TaskManger from "expo-task-manager";

const backgroundS = 'background-neighbor-track';
const mapProvider = Platform.OS === 'ios' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

const notify = async (neighborName: string, boroName: string) => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: "Hey there :)",
            body: `You've entered ${neighborName} - ${boroName}`,
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 2,
        },
    });
}

async function recordNeighborhoodVisit(coords: { latitude: number; longitude: number }) {
    const userLatLng = turf.point([coords.longitude, coords.latitude]);
    const neighborhood = (nycNeighborhoods as any).features.find((feature: any) =>
        turf.booleanPointInPolygon(userLatLng, feature)
    );

    if (!neighborhood) {
        return;
    }

    const json = await AsyncStorage.getItem('@userprofile');
    const arrayJson = json != null ? JSON.parse(json) : [];
    const neighborExists = arrayJson.some((e: any) => e.name === neighborhood.properties.ntaname);

    if (!neighborExists) {
        await notify(neighborhood.properties.ntaname, neighborhood.properties.boroname);
        arrayJson.push({ name: neighborhood.properties.ntaname });
        await AsyncStorage.setItem('@userprofile', JSON.stringify(arrayJson));
    }
}

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});


export default function Index() {

  const [open, setOpen] = useState(false);
  const [selectedNeigh, setSelectedNeigh] = useState(null);
  const mapRef = useRef<MapView>(null);
  const press = useRef(false);
  const descriptionRequestId = useRef(0);
  const hasCenteredOnUser = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedNeighDesc, setSelectedNeighDesc] = useState('');
  const [loadingDesc, setLoadingDesc] = useState(false);
  const [discLocation, setDiscLocation] = useState<any[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [borough, setBorough] = useState('');
  const [neighComplete, setNeighComplete] = useState(0);

    useEffect(() => {
        if (isExpoGo) {
            return;
        }

        (async () => {
            try {
                const {status: statusFc} = await Location.requestForegroundPermissionsAsync();
                if (statusFc !== "granted") {
                    return;
                }

                const {status: statusBc} = await Location.requestBackgroundPermissionsAsync();
                if (statusBc !== "granted") {
                    return;
                }

                await Notifications.requestPermissionsAsync();

            } catch (error) {
                console.warn("Background location is unavailable:", error);
            }
        })();
    }, []);


  useEffect(() => {
        (async () => {
            const {status} = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                return;
            }

            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown) {
                setLocation(lastKnown);
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            setLocation(loc);
        })();
    }, []);

    useEffect(() => {
        if (!location || !mapReady || hasCenteredOnUser.current) {
            return;
        }

        hasCenteredOnUser.current = true;
        mapRef.current?.animateToRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }, 600);
    }, [location, mapReady]);

    useEffect(() => {
        (async () => {
            const {status: existing} = await Notifications.getPermissionsAsync();
            let final = existing;

            if(existing !== 'granted'){
                const {status} = await Notifications.requestPermissionsAsync();
                final = status;
            }
        })()
    }, []);

    useEffect(() => {
        let activeLo: Location.LocationSubscription | undefined;

        (async () => {
            const {status} = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                return;
            }

            activeLo = await Location.watchPositionAsync({
                accuracy: Location.Accuracy.BestForNavigation,
                distanceInterval: 10,
                timeInterval: 5000,
            }, (loca) => {
                recordNeighborhoodVisit(loca.coords).catch((e) => console.log(e));
            })
        })();

        return () => {
            activeLo?.remove();
        }
    }, []);

  const user = (e:any) => {
  }


  const loadNeighborhoodDescription = async (name: string, boro: string) => {
      const requestId = ++descriptionRequestId.current;
      const fallback = neighborhoodInfo[name] ?? "Explore this neighborhood to learn more.";

      setLoadingDesc(true);
      setSelectedNeighDesc(fallback);

      try {
          const aiDescription = await generateNeighborhoodDescription(name, `${boro}, New York City`);

          if (requestId !== descriptionRequestId.current) {
              return;
          }

          if (aiDescription) {
              setSelectedNeighDesc(aiDescription);
          }
      } catch (error) {
          console.warn("Failed to load neighborhood description:", error);
      } finally {
          if (requestId === descriptionRequestId.current) {
              setLoadingDesc(false);
          }
      }
  };

  const active = (e:any) => {
      setNeighComplete(0);

      const lat = e.nativeEvent.coordinate.latitude;
      const lng = e.nativeEvent.coordinate.longitude;

      setTimeout(() => {
          const userLatLng = turf.point([lng, lat]);
          const neighbor = (nycNeighborhoods as any).features.find((feature :any) => {
              return turf.booleanPointInPolygon(userLatLng, feature);
          });

          if (neighbor) {
              const name = neighbor.properties.ntaname;
              if(neighbor.properties.boroname === "Brooklyn"){
                  const bkNum = (nycNeighborhoods as any).features.filter((v:any) =>
                      v.properties.boroname === "Brooklyn"
                  ).length;
                  let bkPer = ((bkComplete / bkNum) * 100);
                  bkPer = Number(bkPer.toFixed(2));
                  setNeighComplete(bkPer);
              } else if (neighbor.properties.boroname === "Manhattan"){
                  const manNum = (nycNeighborhoods as any).features.filter((v:any) =>
                      v.properties.boroname === "Manhattan"
                  ).length;
                  let manPer = (manComplete / manNum) * 100;
                  manPer = Number(manPer.toFixed(2));
                  setNeighComplete(manPer);
              } else if (neighbor.properties.boroname === "Bronx"){
                  const bxNum = (nycNeighborhoods as any).features.filter((v:any) =>
                      v.properties.boroname === "Bronx"
                  ).length;
                  let bxPer = (bxComplete / bxNum) * 100;
                  bxPer = Number(bxPer.toFixed(2));
                  setNeighComplete(bxPer);
              } else if (neighbor.properties.boroname === "Queens"){
                  const queNum = (nycNeighborhoods as any).features.filter((v:any) =>
                      v.properties.boroname === "Queens"
                  ).length;
                  let quePer = (queComplete / queNum) * 100;
                  quePer = Number(quePer.toFixed(2));
                  setNeighComplete(quePer);
              } else if (neighbor.properties.boroname === "Staten Island"){
                  const siNum = (nycNeighborhoods as any).features.filter((v:any) =>
                      v.properties.boroname === "Staten Island"
                  ).length;
                  let siPer = (siComplete / siNum) * 100;
                  siPer = Number(siPer.toFixed(2));
                  setNeighComplete(siPer);
              }
              setSelectedNeigh(name);
              setBorough(neighbor.properties.boroname);
              setOpen(true);
              loadNeighborhoodDescription(name, neighbor.properties.boroname);
          }
      }, 0);

  }
    useEffect(() => {
        (async () => {
            const json = await AsyncStorage.getItem('@userprofile')
            const arrayJson = json != null ? JSON.parse(json) : [];
            setDiscLocation(arrayJson);
        })()
    }, []);


    const visited = useMemo(() => (nycNeighborhoods as any).features.filter((v:any) =>
        discLocation.some((e:any) => e.name === v.properties.ntaname)
    ), [discLocation]);

    const unvisited = useMemo(() => (nycNeighborhoods as any).features.filter((v:any) =>
        !discLocation.some((e:any) => e.name === v.properties.ntaname)
    ), [discLocation]);

    const bkComplete = useMemo(() => (visited as any).filter((v:any) =>
        v.properties.boroname === "Brooklyn"), [visited]).length;

    const manComplete = useMemo(() => (visited as any).filter((v:any) =>
        v.properties.boroname === "Manhattan"), [visited]).length;

    const bxComplete = useMemo(() => (visited as any).filter((v:any) =>
        v.properties.boroname === "Bronx"), [visited]).length;

    const queComplete = useMemo(() => (visited as any).filter((v:any) =>
        v.properties.boroname === "Queens"), [visited]).length;

    const siComplete = useMemo(() => (visited as any).filter((v:any) =>
        v.properties.boroname === "Staten Island"), [visited]).length;


  return (
    <View style={styles.container}>
        <Stack.Screen options={{headerShown: false}}></Stack.Screen>
            <Modal visible={open} transparent={true} onRequestClose={() => setOpen(false)}><TouchableOpacity style={styles.touch} onPress={() => setOpen(false)}>
                <BlurView intensity={20} tint={"extraLight"} style={styles.popUp} pointerEvents={"none"}>
                    <BlurView intensity={80} tint={"light"} style={styles.name}>
                        <Text style={styles.nameText}>{selectedNeigh}</Text>
                    </BlurView>
                    <BlurView intensity={80} tint={"light"} style={styles.descr}>
                        <ScrollView
                            style={styles.descScroll}
                            contentContainerStyle={styles.descScrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={[styles.descText, loadingDesc && styles.descTextLoading]}>
                                {selectedNeighDesc}
                            </Text>
                        </ScrollView>
                    </BlurView>
                </BlurView>
            <BlurView intensity={40} tint={"light"} style={styles.secondPop}><Text style={{fontWeight: "bold", fontSize: 12}}>{borough}</Text>
            <Text>{neighComplete}% Complete</Text></BlurView></TouchableOpacity></Modal>
            <MapView onPress={active} ref={mapRef} onMapReady={() => {
                setMapReady(true);
                mapRef.current?.setMapBoundaries(
                { latitude: 40.9176, longitude: -73.7004 },
                { latitude: 40.4774, longitude: -74.2591 }
                )
            }} minZoomLevel={11} provider={PROVIDER_GOOGLE} showsUserLocation={true}  showsMyLocationButton={true} userLocationFastestInterval={5000} userLocationUpdateInterval={5000} showsCompass={true} onUserLocationChange={user} loadingEnabled={true} style={styles.map} customMapStyle={Platform.OS !== 'android' ? clearMap : undefined} initialRegion={{latitude: location?.coords.latitude ?? 40.75148980530628, longitude:  location?.coords.longitude ?? -73.98365243181523, latitudeDelta: 0.1, longitudeDelta: 0.1}}>
                <Geojson geojson={nycNeighborhoods as any} strokeColor={'rgba(0,0,0,0.5)'} strokeWidth={1} fillColor={'transparent'}></Geojson>
                <Geojson geojson={{type: 'FeatureCollection', features: unvisited} as any} fillColor={'rgba(52,46,46,0.7)'} strokeColor={'rgba(0,0,0,0.5'} strokeWidth={1}></Geojson>
                <Geojson geojson={{type: 'FeatureCollection', features: visited} as any} fillColor={'rgba(255,0,0,0.3)'} strokeColor={'rgba(255,0,0,0.3'} strokeWidth={1}></Geojson>
            </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    popUp:{
      width: '85%',
      alignSelf: 'center',
      position: 'absolute',
      left: '7.5%',
      top: 160,
      borderRadius: 20,
      overflow: 'hidden',
      padding: 14,
      maxHeight: 240,
    },
    secondPop: {
        position: 'absolute',
        width: '50%',
        height: '5%',
        borderRadius: 20,
        overflow: 'hidden',
        top: 90,
        left: "25%",
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: 'center',
        width: '100%',
        borderRadius: 20,
        overflow: 'hidden',
    },
    nameText: {
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    map : {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    mapBorder: {
        width: "100%",
        height: "100%",
        borderWidth: 4,
        borderColor: '#3498db',
        borderRadius: 5,
        overflow: 'hidden',
        padding: 5
    },
    descr: {
        marginTop: 12,
        width: '100%',
        maxHeight: 160,
        borderRadius: 20,
        overflow: 'hidden',
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    descScroll: {
        maxHeight: 144,
    },
    descScrollContent: {
        paddingBottom: 4,
    },
    descText: {
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '500',
        textAlign: 'center',
    },
    descTextLoading: {
        fontWeight: 'normal',
        fontStyle: 'italic',
    },
    touch: {
        flex: 1,
    },
    glass: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    }
})

const clearMap = [
    {
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#ebe3cd"
            }
        ]
    },
    {
        "elementType": "labels",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#523735"
            }
        ]
    },
    {
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "color": "#f5f1e6"
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#c9b2a6"
            }
        ]
    },
    {
        "featureType": "administrative.land_parcel",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "administrative.land_parcel",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#dcd2be"
            }
        ]
    },
    {
        "featureType": "administrative.land_parcel",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#ae9e90"
            }
        ]
    },
    {
        "featureType": "administrative.neighborhood",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "landscape.natural",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#dfd2ae"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#dfd2ae"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#93817c"
            }
        ]
    },
    {
        "featureType": "poi.business",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "poi.park",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#a5b076"
            }
        ]
    },
    {
        "featureType": "poi.park",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#447530"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#f5f1e6"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#fdfcf8"
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#f8c967"
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#e9bc62"
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "labels",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "road.highway.controlled_access",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#e98d58"
            }
        ]
    },
    {
        "featureType": "road.highway.controlled_access",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#db8555"
            }
        ]
    },
    {
        "featureType": "road.local",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#806b63"
            }
        ]
    },
    {
        "featureType": "transit",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "transit.line",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#dfd2ae"
            }
        ]
    },
    {
        "featureType": "transit.line",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#8f7d77"
            }
        ]
    },
    {
        "featureType": "transit.line",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "color": "#ebe3cd"
            }
        ]
    },
    {
        "featureType": "transit.station",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#dfd2ae"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#b9d3c2"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "color": "#92998d"
            }
        ]
    }
]